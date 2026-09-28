const form = document.querySelector("#login-form");
const error = document.querySelector("#login-error");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  error.hidden = false;
  form.querySelector("#password").value = "";
});
