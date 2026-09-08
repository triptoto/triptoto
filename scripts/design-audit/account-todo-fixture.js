// Served only by the loopback audit server after preview data initialization.
// Select with ?preview=1&qaState=account-signed-in (or the states below).
if (QA_STATE === "account-signed-in") {
  state.account = { mode: "account", user: {
    display_name: "Alexandra Montgomery-Wellington",
    primary_email: "alexandra.montgomery.wellington@example.test",
  }};
  state.syncStatus = { pendingOperations: 3 };
}
if (QA_STATE === "account-signin") {
  state.account = { mode: "guest", providers: [
    { provider: "google", enabled: true, clientId: "local-ui-fixture" },
  ] };
}
if (QA_STATE === "checklist-empty") state.checklist = [];
if (QA_STATE === "checklist-complete") {
  state.checklist = state.checklist.map(item => ({ ...item, completed: true }));
}
if (QA_STATE === "checklist-long") {
  state.trip.title = "A longer journey through Italy with friends and family";
  state.checklist = [{ id: "local-long-title", title: "Remember the chargers, train tickets and confirmation numbers for every traveler", completed: false }];
}
