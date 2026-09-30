package to.tripto.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.CancellationSignal;
import android.provider.Settings;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Executor;

/**
 * Small app-specific bridge for things the official Capacitor plugins do not
 * cover:
 *  - Google sign-in through Android Credential Manager (native account sheet,
 *    never an embedded WebView). Returns only a Google ID token bound to the
 *    server's one-time nonce; the backend verifies it exactly like the web flow.
 *  - Handing https/mailto/tel links and private documents to other apps.
 *  - Saving an export where the user picks in the system "Save to" picker
 *    (Storage Access Framework; no storage permission).
 *  - Temporary share/open copies in private cache/tripto-share/ (FileProvider).
 * Tokens and file contents are never logged.
 */
@CapacitorPlugin(name = "TriptoNative")
public class TriptoNativePlugin extends Plugin {

    private static final String SHARE_DIR = "tripto-share";
    private static final long MAX_FILE_BYTES = 40L * 1024 * 1024;

    /** Website-only pages; the app shell is served from https://localhost. */
    private static final Set<String> WEB_ONLY_PATHS = new HashSet<>(
        Arrays.asList("/privacy", "/terms", "/cookies", "/contact", "/landing", "/delete-account")
    );

    /**
     * Safety net for top-level navigations the web layer did not route itself:
     * website-only pages open on https://tripto.to in the browser instead of
     * reloading the bundled app. Everything else keeps Capacitor's default
     * (external hosts and tel:/mailto: go to the matching app).
     */
    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        if (!"https".equals(url.getScheme()) || !"localhost".equals(url.getHost())) return null;
        String path = url.getPath() == null ? "" : url.getPath().replaceAll("\\.html$", "").replaceAll("/+$", "");
        if (!WEB_ONLY_PATHS.contains(path)) return null;
        Intent intent = new Intent(Intent.ACTION_VIEW, url.buildUpon().authority("tripto.to").path(path).build());
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
            // No browser: stay on the current screen.
        }
        return true;
    }

    private Executor mainExecutor() {
        return ContextCompat.getMainExecutor(getContext());
    }

    @PluginMethod
    public void googleSignIn(PluginCall call) {
        String serverClientId = call.getString("serverClientId", "");
        String nonce = call.getString("nonce", "");
        if (serverClientId.isEmpty() || !serverClientId.endsWith(".apps.googleusercontent.com") || nonce.isEmpty() || nonce.length() > 200) {
            call.reject("Google sign-in is not configured.", "INVALID_ARGUMENT");
            return;
        }
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(serverClientId).setNonce(nonce).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager manager = CredentialManager.create(getContext());
        manager.getCredentialAsync(
            getActivity(),
            request,
            new CancellationSignal(),
            mainExecutor(),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    Credential credential = response.getCredential();
                    if (
                        credential instanceof CustomCredential &&
                        GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())
                    ) {
                        try {
                            GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());
                            JSObject result = new JSObject();
                            result.put("idToken", google.getIdToken());
                            call.resolve(result);
                        } catch (Exception e) {
                            call.reject("Google sign-in returned an unreadable credential.", "INVALID_CREDENTIAL");
                        }
                        return;
                    }
                    call.reject("Google sign-in returned an unexpected credential.", "INVALID_CREDENTIAL");
                }

                @Override
                public void onError(GetCredentialException e) {
                    if (e instanceof GetCredentialCancellationException) call.reject("Sign-in canceled.", "CANCELED");
                    else if (e instanceof NoCredentialException) call.reject("No Google account is available on this device.", "NO_ACCOUNT");
                    else call.reject("Google sign-in could not be completed.", "SIGN_IN_FAILED");
                }
            }
        );
    }

    /** Forget the selected Google account so the next sign-in shows the chooser (account switching). */
    @PluginMethod
    public void googleSignOut(PluginCall call) {
        CredentialManager.create(getContext()).clearCredentialStateAsync(
            new ClearCredentialStateRequest(),
            new CancellationSignal(),
            mainExecutor(),
            new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override
                public void onResult(Void unused) {
                    call.resolve();
                }

                @Override
                public void onError(ClearCredentialException e) {
                    call.resolve();
                }
            }
        );
    }

    /** Opens an https/mailto/tel URL in the app that handles it (Maps, Waze, browser, mail, dialer). */
    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        Intent intent;
        if (scheme.equals("https") || scheme.equals("http")) {
            intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
        } else if (scheme.equals("mailto")) {
            intent = new Intent(Intent.ACTION_SENDTO, uri);
        } else if (scheme.equals("tel")) {
            intent = new Intent(Intent.ACTION_DIAL, uri);
        } else {
            call.reject("Unsupported link.", "UNSUPPORTED_URL");
            return;
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No app can open this link.", "NO_APP");
        }
    }

    /** Lets the user choose where to save an export (system "Save to" picker). */
    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = safeName(call.getString("name", "file"));
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (call.getString("data", "").isEmpty()) {
            call.reject("The file is empty.", "INVALID_FILE");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(call, intent, "saveFileResult");
        } catch (ActivityNotFoundException e) {
            call.reject("No app on this phone can save files.", "NO_APP");
        }
    }

    @ActivityCallback
    private void saveFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("Save canceled.", "CANCELED");
            return;
        }
        byte[] bytes;
        try {
            bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("The file is damaged.", "INVALID_FILE");
            return;
        }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(data.getData())) {
            if (out == null) throw new IOException("No output stream");
            out.write(bytes);
            call.resolve();
        } catch (IOException | SecurityException e) {
            call.reject("The file could not be saved there. Choose another place.", "STORAGE_ERROR");
        }
    }

    /** Writes a temporary private copy for sharing/opening. Returns a file:// URI inside cache/tripto-share/. */
    @PluginMethod
    public void writeShareFile(PluginCall call) {
        String name = safeName(call.getString("name", "file"));
        String data = call.getString("data", "");
        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("The file is damaged.", "INVALID_FILE");
            return;
        }
        if (bytes.length == 0 || bytes.length > MAX_FILE_BYTES) {
            call.reject("The file is empty or too large.", "INVALID_FILE");
            return;
        }
        File dir = new File(getContext().getCacheDir(), SHARE_DIR);
        if (!dir.isDirectory() && !dir.mkdirs()) {
            call.reject("Could not prepare the file.", "STORAGE_ERROR");
            return;
        }
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        } catch (IOException e) {
            file.delete();
            call.reject("Not enough free storage to prepare the file.", "STORAGE_ERROR");
            return;
        }
        JSObject result = new JSObject();
        result.put("uri", Uri.fromFile(file).toString());
        result.put("name", name);
        call.resolve(result);
    }

    /** Opens a file previously written by writeShareFile in an external viewer (content:// + read grant). */
    @PluginMethod
    public void openFile(PluginCall call) {
        String name = safeName(call.getString("name", ""));
        String mimeType = call.getString("mimeType", "application/octet-stream");
        File file = new File(new File(getContext().getCacheDir(), SHARE_DIR), name);
        if (!file.isFile()) {
            call.reject("The file is no longer available.", "NOT_FOUND");
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(uri, mimeType);
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(view, null);
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No app on this phone can open this file.", "NO_APP");
        }
    }

    /** Deletes all temporary share/open copies. Called on app start. */
    @PluginMethod
    public void clearShareFiles(PluginCall call) {
        clearShareDir();
        call.resolve();
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Settings are unavailable.", "NO_APP");
        }
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Settings are unavailable.", "NO_APP");
        }
    }

    void clearShareDir() {
        File dir = new File(getContext().getCacheDir(), SHARE_DIR);
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) f.delete();
    }

    private static String safeName(String raw) {
        String name = raw == null ? "" : raw.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (name.isEmpty() || name.equals(".") || name.equals("..")) name = "file";
        if (name.length() > 120) name = name.substring(name.length() - 120);
        return name;
    }
}
