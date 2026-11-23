/* Shared helpers for the catch wall and website reviews. */
(function () {
  var config = window.BIGC_CONFIG || { apiBase: "", turnstileSiteKey: "" };

  function api(path) {
    return String(config.apiBase || "").replace(/\/$/, "") + path;
  }

  function mountTurnstile(el) {
    var state = { id: null, tries: 0 };
    var key = config.turnstileSiteKey;
    if (!el || !key) return { token: function () { return ""; }, reset: function () {} };
    // The Turnstile script can exist before render() is ready. Wait for the function.
    function render() {
      state.tries += 1;
      var api = window.turnstile;
      if (!api || typeof api.render !== "function") {
        if (state.tries < 100) window.setTimeout(render, 100);
        return;
      }
      if (state.id !== null) return;
      try {
        state.id = api.render(el, { sitekey: key, theme: "dark" });
      } catch (err) {
        if (state.tries < 100) window.setTimeout(render, 150);
      }
    }
    render();
    return {
      token: function () {
        var input = el.parentElement && el.parentElement.querySelector("[name='cf-turnstile-response']");
        if (input && input.value) return input.value;
        if (window.turnstile && typeof window.turnstile.getResponse === "function" && state.id !== null) {
          return window.turnstile.getResponse(state.id) || "";
        }
        return "";
      },
      reset: function () {
        if (window.turnstile && typeof window.turnstile.reset === "function" && state.id !== null) {
          window.turnstile.reset(state.id);
        }
      }
    };
  }

  function formatDate(iso) {
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function stars(n) {
    var full = "";
    var i;
    for (i = 0; i < 5; i += 1) full += i < n ? "★" : "☆";
    return full;
  }

  window.BIGC = {
    api: api,
    mountTurnstile: mountTurnstile,
    formatDate: formatDate,
    stars: stars
  };
})();
