(function (root, factory) {
  "use strict";
  root.TriptoTripRules = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  function validateManualTrip(input = {}) {
    const title = String(input.title || "").trim(),
      startsOn = String(input.startsOn || "").trim(),
      endsOn = String(input.endsOn || "").trim();

    if (!title)
      return { valid: false, field: "title", message: "Enter a trip name." };
    if (!startsOn)
      return {
        valid: false,
        field: "startsOn",
        message: "Choose a start date.",
      };
    if (!DATE_PATTERN.test(startsOn))
      return {
        valid: false,
        field: "startsOn",
        message: "Choose a valid start date.",
      };
    if (!endsOn)
      return {
        valid: false,
        field: "endsOn",
        message: "Choose an end date.",
      };
    if (!DATE_PATTERN.test(endsOn))
      return {
        valid: false,
        field: "endsOn",
        message: "Choose a valid end date.",
      };
    if (endsOn < startsOn)
      return {
        valid: false,
        field: "endsOn",
        message: "End date cannot be before start date.",
      };

    return { valid: true, values: { title, startsOn, endsOn } };
  }

  return Object.freeze({ validateManualTrip });
});
