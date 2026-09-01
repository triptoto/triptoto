(() => {
  if (location.hostname.toLowerCase() !== "www.tripto.to") return;
  const target = new URL(location.href);
  target.hostname = "tripto.to";
  location.replace(target.href);
})();
