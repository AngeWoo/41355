(function () {
  'use strict';
  window.MemberBarcode = {
    init: function (options) {
      var el = function (id) { return document.getElementById(id); };
      var picker = el('barcodeFile'), preview = el('barcodePreview'), dialog = el('barcodeDialog');
      var scan = el('barcodeScanImage'), status = el('barcodeStatus'), scanStatus = el('barcodeScanStatus');
      var paneImage = el('barcodePaneImage'), paneStatus = el('barcodePaneStatus');
      var saved = '', pending = '', busy = false, loaded = false, generation = 0;
      // 圖片只暫存在此頁記憶體；不寫入瀏覽器持久儲存。
      var cacheToken = '', loadedAt = 0, readPromise = null, CACHE_MS = 5 * 60 * 1000;
      var returnFocus = null;
      function session() { return options.getSession(); }
      function current(token, version) { var s = session(); return !!s && s.token === token && generation === version; }
      function picture(img, url) {
        img.hidden = !url;
        if (url) { if (img.getAttribute('src') !== url) img.src = url; }
        else img.removeAttribute('src');
      }
      function paint() {
        picker.disabled = busy;
        el('memberBarcodeOpen').disabled = busy;
        el('barcodeSave').disabled = busy || !pending;
        el('barcodeCancel').hidden = !pending;
        el('barcodeCancel').disabled = busy;
        el('barcodeRemove').disabled = busy || !saved;
        el('barcodeShow').disabled = busy || !saved || !!pending;
        el('barcodePaneShow').disabled = busy || !loaded || !saved;
        el('barcodeRetry').disabled = el('barcodePaneRetry').disabled = busy;
        picture(paneImage, loaded ? saved : '');
        picture(preview, pending || saved);
      }
      function message(text) { status.textContent = text; scanStatus.textContent = text; paneStatus.textContent = text; }
      function retryVisible(visible) { el('barcodeRetry').hidden = el('barcodePaneRetry').hidden = !visible; }
      function checkResponse(res) {
        if (!res || !res.ok) {
          if (res && res.code === 'auth_invalid') options.onAuthError();
          if (res && /未知的 action/.test(res.error || '')) throw new Error('條碼功能尚待更新雲端服務，請聯絡管理員。');
          throw new Error(res && res.error || '讀取失敗，請稍後再試。');
        }
        return res;
      }
      function reset() {
        generation++;
        cacheToken = ''; loadedAt = 0; readPromise = null;
        saved = pending = ''; busy = loaded = false; picker.value = '';
        picture(scan, ''); paint();
        retryVisible(false);
        if (dialog.open) dialog.close();
        message('尚未讀取條碼圖片。');
      }
      function load(force) {
        var s = session();
        if (!s) return Promise.resolve();
        if (cacheToken && cacheToken !== s.token) reset();
        cacheToken = s.token;
        if (readPromise) return readPromise;
        if (busy) return Promise.resolve();
        if (loaded && !force && Date.now() - loadedAt < CACHE_MS) {
          if (dialog.open) picture(scan, saved);
          return Promise.resolve();
        }
        var token = s.token, version = generation;
        busy = true; loaded = false; paint(); message('讀取條碼圖片中…');
        picture(scan, ''); retryVisible(false);
        readPromise = API.memberBarcode(token).then(function (res) {
          if (!current(token, version)) return;
          checkResponse(res);
          var url = res.data && res.data.dataUrl || '';
          if (url && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(url)) throw new Error('圖片格式不正確。');
          saved = url; loaded = true; loadedAt = Date.now();
          if (dialog.open) picture(scan, saved);
          retryVisible(true);
          message(saved ? '已讀取雲端條碼圖片。' : '尚未新增條碼圖片，請至「修改資料」上傳。');
        }).catch(function (err) {
          if (!current(token, version)) return;
          message(err.message || '圖片讀取失敗。'); retryVisible(true);
        }).finally(function () {
          if (current(token, version)) { readPromise = null; busy = false; paint(); }
        });
        return readPromise;
      }
      function show() {
        if (!session()) return;
        // 快取命中時直接出示，不必再次等待雲端下載。
        load(false);
        if (!dialog.open) {
          returnFocus = document.activeElement;
          dialog.showModal();
          el('barcodeScanSurface').focus({ preventScroll: true });
        }
        picture(scan, loaded ? saved : '');
      }
      picker.addEventListener('change', function () {
        var file = picker.files[0], s = session();
        pending = ''; paint();
        if (!file || !s) return;
        if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024 || !file.size) {
          picker.value = ''; message('請選擇 5 MB 以內的 PNG、JPG 或 WebP 圖片。'); return;
        }
        var token = s.token, version = generation;
        busy = true; paint(); message('檢查圖片中…');
        var reader = new FileReader();
        function fail() {
          if (!current(token, version)) return;
          busy = false; pending = ''; picker.value = ''; paint(); message('無法開啟此圖片，請重新選擇。');
        }
        reader.onerror = fail;
        reader.onload = function () {
          var img = new Image();
          img.onerror = fail;
          img.onload = function () {
            if (!current(token, version)) return;
            pending = String(reader.result); busy = false; paint();
            message('圖片尚未儲存，請按「儲存條碼圖片」。');
          };
          img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
      });
      function save(remove) {
        var s = session();
        if (!s || busy || (!remove && !pending)) return;
        var token = s.token, version = generation, selected = pending;
        var file = remove ? null : { mimeType: selected.slice(5, selected.indexOf(';')), base64: selected.split(',')[1] };
        busy = true; paint(); message(remove ? '移除圖片中…' : '儲存條碼圖片至雲端中…');
        API.memberSaveBarcode(file, remove, token).then(function (res) {
          if (!current(token, version)) return;
          checkResponse(res);
          saved = remove ? '' : selected; pending = ''; loaded = true; loadedAt = Date.now(); cacheToken = token; picker.value = '';
          retryVisible(true);
          if (dialog.open) picture(scan, saved);
          message(remove ? '條碼圖片已移除。' : '條碼圖片已儲存，可在其他裝置登入後出示。');
        }).catch(function (err) {
          if (current(token, version)) {
            loaded = false; loadedAt = 0; retryVisible(true);
            message((err.message || '儲存失敗。') + ' 若連線中斷，請重新讀取確認雲端結果。');
          }
        }).finally(function () {
          if (current(token, version)) { busy = false; paint(); }
        });
      }
      el('barcodeSave').addEventListener('click', function () { save(false); });
      el('barcodeRemove').addEventListener('click', function () {
        if (saved && !busy && window.confirm('確定移除已儲存的個人條碼圖片？')) save(true);
      });
      el('barcodeCancel').addEventListener('click', function () { pending = ''; picker.value = ''; paint(); message('已取消選取。'); });
      el('barcodeShow').addEventListener('click', show);
      el('barcodePaneShow').addEventListener('click', show);
      el('barcodePaneManage').addEventListener('click', options.openProfile);
      el('barcodePaneRetry').addEventListener('click', function () { load(true); });
      el('memberBarcodeOpen').addEventListener('click', show);
      el('barcodeClose').addEventListener('click', function () { dialog.close(); });
      el('barcodeRetry').addEventListener('click', function () { load(true); });
      el('barcodeManage').addEventListener('click', function () { dialog.close(); options.openProfile(); });
      // 只關閉最上層條碼視窗，不讓 Escape 同時關閉後方會員資料。
      dialog.addEventListener('keydown', function (event) { if (event.key === 'Escape') event.stopPropagation(); });
      dialog.addEventListener('close', function () {
        picture(scan, '');
        if (session()) {
          var target = returnFocus && !returnFocus.disabled && returnFocus.getClientRects().length ? returnFocus : el('memberClose');
          if (target && target.getClientRects().length) target.focus({ preventScroll: true });
        }
        returnFocus = null;
      });
      window.addEventListener('storage', function (event) {
        if (!event.key || event.key === 'shinnyo_member_v2') reset();
      });
      scan.addEventListener('error', function () { picture(scan, ''); message('圖片無法顯示，請重新上傳有效圖片。'); });
      return {
        reset: reset,
        load: load,
        openInline: function () {
          el('barcodePaneSurface').focus({ preventScroll: true });
          return load(false);
        }
      };
    }
  };
})();
