/* Website reviews under each product, and the review form. */
(function () {
  var mounts = document.querySelectorAll(".product-reviews");
  var form = document.getElementById("review-form");

  function writeLink(productId) {
    var link = document.createElement("a");
    link.className = "write-review";
    link.href = "review.html?product=" + encodeURIComponent(productId);
    link.textContent = "Write a review";
    return link;
  }

  function renderMount(mount, failed, reviews) {
    var productId = mount.getAttribute("data-product-id");
    mount.replaceChildren();
    var heading = document.createElement("p");
    heading.className = "reviews-label";
    heading.textContent = "Reviews on our website";
    mount.appendChild(heading);
    var separate = document.createElement("p");
    separate.className = "review-note";
    separate.textContent = "Separate from Amazon reviews.";
    mount.appendChild(separate);
    if (failed) {
      var down = document.createElement("p");
      down.className = "review-note";
      down.textContent = "Reviews on our website are not available right now.";
      mount.appendChild(down);
      mount.appendChild(writeLink(productId));
      return;
    }
    if (!reviews.length) {
      var none = document.createElement("p");
      none.className = "review-note";
      none.textContent = "No reviews on our website yet.";
      mount.appendChild(none);
      mount.appendChild(writeLink(productId));
      return;
    }
    var sum = reviews.reduce(function (total, review) { return total + Number(review.stars || 0); }, 0);
    var avg = sum / reviews.length;
    var summary = document.createElement("p");
    summary.className = "avg";
    summary.textContent = window.BIGC.stars(Math.round(avg)) + "  " + avg.toFixed(1) + " · " + reviews.length + (reviews.length === 1 ? " review" : " reviews");
    mount.appendChild(summary);
    var list = document.createElement("div");
    list.className = "review-list";
    reviews.slice(0, 3).forEach(function (review) {
      var item = document.createElement("div");
      item.className = "review-item";
      var who = document.createElement("p");
      who.className = "who";
      who.textContent = window.BIGC.stars(Number(review.stars) || 0) + "  " + (review.name || "Angler");
      item.appendChild(who);
      var text = document.createElement("p");
      text.textContent = review.text || "";
      item.appendChild(text);
      list.appendChild(item);
    });
    mount.appendChild(list);
    mount.appendChild(writeLink(productId));
  }

  async function loadMounts() {
    if (!mounts.length) return;
    var failed = false;
    var reviews = [];
    try {
      var res = await fetch(window.BIGC.api("/api/reviews"));
      if (!res.ok) throw new Error("status");
      var data = await res.json();
      reviews = data.reviews || [];
    } catch (err) {
      failed = true;
    }
    mounts.forEach(function (mount) {
      var id = mount.getAttribute("data-product-id");
      var mine = reviews.filter(function (review) { return review.productId === id; });
      renderMount(mount, failed, mine);
    });
  }

  function message(text, kind) {
    var el = document.getElementById("review-message");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.className = "form-message" + (kind ? " " + kind : "");
  }

  async function setupForm() {
    if (!form) return;
    var select = document.getElementById("product");
    var res = await fetch("data/products.json");
    if (!res.ok) throw new Error("products");
    var products = await res.json();
    products.forEach(function (product) {
      var option = document.createElement("option");
      option.value = product.id;
      option.textContent = product.name;
      select.appendChild(option);
    });
    var params = new URLSearchParams(window.location.search);
    var chosen = params.get("product");
    if (chosen && products.some(function (product) { return product.id === chosen; })) {
      select.value = chosen;
    }
    var text = document.getElementById("review-text");
    var count = document.getElementById("review-count");
    text.addEventListener("input", function () {
      count.textContent = text.value.length + " / 1000";
    });
    var turnstile = window.BIGC.mountTurnstile(document.getElementById("turnstile"));
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      message("");
      if (!document.getElementById("review-consent").checked) {
        message("Please confirm we may show this review.", "error");
        return;
      }
      var stars = form.querySelector("input[name='stars']:checked");
      if (!stars) {
        message("Pick a star rating.", "error");
        return;
      }
      var button = document.getElementById("review-submit");
      button.disabled = true;
      button.textContent = "Sending…";
      try {
        var res = await fetch(window.BIGC.api("/api/reviews"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: select.value,
            stars: Number(stars.value),
            reviewText: text.value,
            reviewerName: document.getElementById("reviewer-name").value,
            consent: true,
            turnstileToken: turnstile.token()
          })
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(data.error || "Please try again.");
        form.reset();
        if (chosen) select.value = chosen;
        count.textContent = "0 / 1000";
        turnstile.reset();
        message("Thanks. We have it. It will show on the product after it is approved.", "ok");
      } catch (err) {
        message((err && err.message) || "Please try again.", "error");
      } finally {
        button.disabled = false;
        button.textContent = "Send for review";
      }
    });
  }

  loadMounts();
  if (form) {
    setupForm().catch(function () {
      var select = document.getElementById("product");
      if (!select || select.options.length < 2) {
        message("The product list did not load. Refresh the page.", "error");
      }
    });
  }
})();
