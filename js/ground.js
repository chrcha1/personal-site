// Picks the page's two colours before first paint: the ground, and the ink
// that both the words and the picture are drawn in. One pair per visit.
//
// Loaded as a plain blocking script from <head> so there is no flash.
// Edit the list freely; keep each pair at a contrast of 4.5:1 or better.
// To pin a single look, leave one pair in the list.
(function () {
  var pairs = [
    ['#0a0a0a', '#ffffff'], // night
    ['#1b27c9', '#ffffff'], // ultramarine
    ['#6a37dd', '#ffffff'], // violet
    ['#00463f', '#ffffff'], // kelp
    ['#dcff4a', '#0b0b0b'], // acid
    ['#ff4f1f', '#0b0b0b'], // vermilion
    ['#eceae2', '#0b0b0b'], // paper
  ];
  var pick = pairs[Math.floor(Math.random() * pairs.length)];
  var asked = new URLSearchParams(location.search).get('ground');
  if (asked !== null && pairs[Number(asked)]) pick = pairs[Number(asked)];
  var root = document.documentElement;
  root.style.setProperty('--ground', pick[0]);
  root.style.setProperty('--ink', pick[1]);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', pick[0]);
})();
