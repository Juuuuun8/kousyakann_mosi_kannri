const form = document.querySelector("#login-form");
const error = document.querySelector("#login-error");
const email = form.querySelector("#email");
const password = form.querySelector("#password");
const demoEmail = ["demo.admin", "example.invalid"].join("@");
const demoPassword = ["demo", "admin", "password"].join("-");

document.querySelector("#demo-fill").addEventListener("click", () => {
  email.value = demoEmail;
  password.value = demoPassword;
  error.hidden = true;
  email.focus();
});

form.addEventListener("submit", (event) => {
  if (email.value.trim().toLowerCase() === demoEmail && password.value === demoPassword) return;
  event.preventDefault();
  error.hidden = false;
  password.value = "";
  password.focus();
});
