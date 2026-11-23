/* Catch Wall and the share-a-catch form. */
(function () {
  var grid = document.getElementById("catch-grid");
  var empty = document.getElementById("catch-empty");
  var form = document.getElementById("catch-form");
  if (!grid && !form) return;

  function message(text, kind) {
    var el = document.getElementById("catch-message");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.className = "form-message" + (kind ? " " + kind : "");
  }

  function render(catches) {
    grid.replaceChildren();
    if (!catches.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    catches.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "catch-card";
      var img = document.createElement("img");
      img.src = item.photoUrl;
      img.alt = item.species ? item.species + " catch" : "Catch photo";
      card.appendChild(img);
      var body = document.createElement("div");
      body.className = "catch-body";
      var title = document.createElement("h3");
      title.textContent = item.species || "Catch";
      body.appendChild(title);
      var meta = document.createElement("p");
      meta.className = "catch-meta";
      var bits = [item.lure, item.anglerName, window.BIGC.formatDate(item.createdAt)];
      if (item.location) bits.splice(1, 0, item.location);
      meta.textContent = bits.filter(Boolean).join(" · ");
      body.appendChild(meta);
      if (item.note) {
        var note = document.createElement("p");
        note.className = "catch-note";
        note.textContent = item.note;
        body.appendChild(note);
      }
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  async function loadWall() {
    if (!grid) return;
    try {
      var res = await fetch(window.BIGC.api("/api/catches"));
      if (!res.ok) throw new Error("status");
      var data = await res.json();
      render(data.catches || []);
    } catch (err) {
      empty.hidden = false;
      empty.textContent = "The Catch Wall is not available right now.";
    }
  }

  function fillLures(products) {
    var select = document.getElementById("lure");
    if (!select) return;
    products.forEach(function (product) {
      var option = document.createElement("option");
      option.value = product.id;
      option.textContent = product.name;
      select.appendChild(option);
    });
    var other = document.createElement("option");
    other.value = "other";
    other.textContent = "Other";
    select.appendChild(other);
  }

  async function loadProducts() {
    var res = await fetch("data/products.json");
    if (!res.ok) throw new Error("products");
    fillLures(await res.json());
  }

  loadWall();

  var turnstile = form ? window.BIGC.mountTurnstile(document.getElementById("turnstile")) : null;

  if (form) {
    var lure = document.getElementById("lure");
    var otherWrap = document.getElementById("lure-other-wrap");
    var otherInput = document.getElementById("lure-other");
    lure.addEventListener("change", function () {
      var show = lure.value === "other";
      otherWrap.hidden = !show;
      otherInput.required = show;
      if (!show) otherInput.value = "";
    });
    var note = document.getElementById("note");
    var count = document.getElementById("note-count");
    note.addEventListener("input", function () {
      count.textContent = note.value.length + " / 500";
    });
    var previewUrl = "";
    document.getElementById("photo").addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      var preview = document.getElementById("photo-preview");
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (!file) {
        preview.hidden = true;
        return;
      }
      previewUrl = URL.createObjectURL(file);
      preview.src = previewUrl;
      preview.hidden = false;
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      message("");
      var button = document.getElementById("catch-submit");
      var file = document.getElementById("photo").files[0];
      if (!file) {
        message("Add a photo of the catch.", "error");
        return;
      }
      if (!document.getElementById("photo-consent").checked) {
        message("Please confirm we may show this photo.", "error");
        return;
      }
      if (!document.getElementById("age-consent").checked) {
        message("Please confirm you are 18 or older, or have a parent's permission.", "error");
        return;
      }
      button.disabled = true;
      button.textContent = "Sending…";
      try {
        var blob = await window.BIGC.compressPhoto(file);
        var body = new FormData();
        body.set("photo", blob, "catch.jpg");
        body.set("species", document.getElementById("species").value);
        body.set("lure", lure.value);
        body.set("lureOther", otherInput.value);
        body.set("location", document.getElementById("location").value);
        body.set("note", note.value);
        body.set("anglerName", document.getElementById("angler-name").value);
        body.set("photoConsent", "yes");
        body.set("ageConsent", "yes");
        body.set("cf-turnstile-response", turnstile ? turnstile.token() : "");
        var res = await fetch(window.BIGC.api("/api/catches"), { method: "POST", body: body });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(data.error || "Please try again.");
        form.reset();
        otherWrap.hidden = true;
        document.getElementById("photo-preview").hidden = true;
        if (turnstile) turnstile.reset();
        count.textContent = "0 / 500";
        message("Thanks. We have it. It will show on the Catch Wall after it is approved.", "ok");
      } catch (err) {
        var text = err && err.message === "too-big"
          ? "That photo is still too large. Try a different one."
          : (err && err.message === "unsupported"
            ? "This browser could not prepare the photo. Try a JPEG."
            : (err && err.message) || "Please try again.");
        message(text, "error");
      } finally {
        button.disabled = false;
        button.textContent = "Share this catch";
      }
    });
  }

  if (form) {
    loadProducts().catch(function () {
      message("The product list did not load. Refresh the page.", "error");
    });
  }
})();
