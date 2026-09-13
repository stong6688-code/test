(function () {
  'use strict';

  /* ---------- 轮播 ---------- */
  function initSwiper(el) {
    var track = el.querySelector('.sp-swiper-track');
    var items = el.querySelectorAll('.sp-swiper-item');
    var dots  = el.querySelectorAll('.sp-swiper-dot');
    if (!track || items.length === 0) return;

    var idx = 0, timer = null;
    var interval = parseInt(el.dataset.interval, 10) || 3500;
    var count = items.length;

    function go(i) {
      idx = (i + count) % count;
      track.style.transform = 'translateX(' + (-idx * 100) + '%)';
      dots.forEach(function (d, k) { d.classList.toggle('active', k === idx); });
    }
    function next() { go(idx + 1); }
    function start() { if (count > 1) timer = setInterval(next, interval); }
    function stop()  { if (timer) { clearInterval(timer); timer = null; } }

    /* 触摸滑动 */
    var startX = 0, moveX = 0, dragging = false;
    el.addEventListener('touchstart', function (e) {
      dragging = true; startX = e.touches[0].clientX; stop();
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      moveX = e.touches[0].clientX - startX;
    }, { passive: true });
    el.addEventListener('touchend', function () {
      if (!dragging) return;
      dragging = false;
      if (Math.abs(moveX) > 40) { moveX < 0 ? go(idx + 1) : go(idx - 1); }
      moveX = 0; start();
    });

    /* 鼠标拖拽 */
    var mStart = 0, mDown = false;
    el.addEventListener('mousedown', function (e) { mDown = true; mStart = e.clientX; stop(); });
    el.addEventListener('mouseup', function (e) {
      if (!mDown) return; mDown = false;
      var diff = e.clientX - mStart;
      if (Math.abs(diff) > 40) { diff < 0 ? go(idx + 1) : go(idx - 1); }
      start();
    });

    go(0); start();
  }

  /* ---------- 表格包裹 ---------- */
  function wrapTables(root) {
    root.querySelectorAll('table').forEach(function (t) {
      if (t.parentElement && t.parentElement.classList.contains('sp-table-wrap')) return;
      var wrap = document.createElement('div');
      wrap.className = 'sp-table-wrap';
      t.parentNode.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
  }

  /* ---------- 图片懒加载 ---------- */
  function lazyImages(root) {
    root.querySelectorAll('img').forEach(function (img) {
      img.setAttribute('loading', 'lazy');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.sp-swiper').forEach(initSwiper);
    var content = document.querySelector('.sp-content') || document.body;
    wrapTables(content);
    lazyImages(content);
  });
})();