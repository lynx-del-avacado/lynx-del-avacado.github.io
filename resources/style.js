// Get hamburger menu and navigation menu elements
const hamburger = document.querySelector(".hamburger");
const navMenu = document.querySelector(".nav-menu");

// Toggle mobile menu when hamburger is clicked
hamburger.addEventListener("click", mobileMenu);

// Toggle hamburger icon between ☰ (open) and ✕ (close)
function mobileMenu() {
  if (hamburger.innerText == "☰") {
    hamburger.innerText = "✕";
  } else if (hamburger.innerText == "✕") {
    hamburger.innerText = "☰";
  }
}

// Get navigation alert elements
navAlert = document.getElementById("nav-alert");
navAlertDelete = document.getElementById("nav-alert-delete");

// Remove the navigation alert banner when delete button is clicked
// navAlertDelete.addEventListener("click", deleteNavAlert);

// Delete the navigation alert element
function deleteNavAlert() {
  navAlert.remove();
}
