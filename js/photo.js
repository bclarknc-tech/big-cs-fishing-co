/* Resize a catch photo in the browser and drop camera location data. */
(function () {
  var MAX_BYTES = 1024 * 1024;

  function render(bitmap, maxEdge, quality) {
    var scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    var width = Math.max(1, Math.round(bitmap.width * scale));
    var height = Math.max(1, Math.round(bitmap.height * scale));
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error("encode"));
        else resolve(blob);
      }, "image/jpeg", quality);
    });
  }

  function decode(file) {
    if (typeof createImageBitmap !== "function") {
      return Promise.reject(new Error("unsupported"));
    }
    return createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () {
      return createImageBitmap(file);
    });
  }

  async function compressPhoto(file) {
    var bitmap = await decode(file);
    try {
      var edge = Math.min(1600, Math.max(bitmap.width, bitmap.height));
      var quality = 0.82;
      var blob = await render(bitmap, edge, quality);
      while (blob.size > MAX_BYTES && edge > 640) {
        edge = Math.round(edge * 0.8);
        blob = await render(bitmap, edge, 0.72);
      }
      quality = 0.64;
      while (blob.size > MAX_BYTES && quality >= 0.42) {
        blob = await render(bitmap, edge, quality);
        quality -= 0.08;
      }
      if (blob.size > MAX_BYTES) {
        throw new Error("too-big");
      }
      return blob;
    } finally {
      if (bitmap.close) bitmap.close();
    }
  }

  window.BIGC = window.BIGC || {};
  window.BIGC.compressPhoto = compressPhoto;
})();
