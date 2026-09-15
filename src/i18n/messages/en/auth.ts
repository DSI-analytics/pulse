import type { Messages } from "../../types";

/** English translations for the "auth" module. Must mirror ../pt/auth.ts. */
const auth: Messages["auth"] = {
  login: {
    title: "Sign in",
    subtitle: "Access your clinic's management.",
    heroTitle: "Your clinic's pulse, in real time.",
    heroBody:
      "Appointments, doctor utilisation, revenue, stock and receivables — one platform, designed for clinics in Mozambique.",
    email: "Email",
    emailPlaceholder: "you@clinic.mz",
    password: "Password",
    forgotPassword: "Forgot password",
    submit: "Sign in",
    idleNotice: "Your session ended after 15 minutes without activity. Sign in again.",
    demoTitle: "Demo accounts",
    demoPassword: "Password:",
  },
  reset: {
    title: "Reset password",
    description: "Receive a confirmation code at the email address linked to your account.",
    doneTitle: "Password updated",
    doneBody: "You can now sign in with your new password.",
    backToLogin: "Back to sign in",
    codeSent: "If the address is registered, we have sent a code to {email}.",
    code: "Confirmation code",
    newPassword: "New password",
    confirmPassword: "Confirm password",
    confirmSubmit: "Confirm and change",
    otherEmail: "Use another email",
    accountEmail: "Account email",
    sendCode: "Send code",
  },
  errors: {
    invalidEmail: "Invalid email",
    passwordRequired: "Enter your password",
    invalidCredentials: "Invalid credentials.",
    tooManyAttempts: "Too many attempts. Please try again in {minutes} minute(s).",
    enterValidEmail: "Enter a valid email address.",
    codeFormat: "The code must have 6 digits.",
    passwordLength: "The password must be at least 8 characters long.",
    passwordMismatch: "The passwords do not match.",
    sendFailed: "The email could not be sent. Please try again in a few minutes.",
    codeInvalidOrExpired: "Invalid or expired code.",
    codeInvalidOrExpiredRetry: "Invalid or expired code. Request a new code.",
    codeInvalidRemaining: "Invalid code. {remaining} attempts left.",
    codeBlocked: "Code blocked. Request a new code.",
  },
};

export default auth;
