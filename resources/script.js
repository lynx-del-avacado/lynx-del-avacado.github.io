// Generate a random integer between min (inclusive) and max (exclusive)
function getRndInteger(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

// Navigate to a page by replacing the current URL
function goToPage(page) {
  window.location.replace(page);
}
