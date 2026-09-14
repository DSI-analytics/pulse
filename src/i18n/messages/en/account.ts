import type { Messages } from "../../types";

/** English translations for the "account" module. Must mirror ../pt/account.ts. */
const account: Messages["account"] = {
  eyebrow: "Account",
  title: "My details",
  description: "View your personal details and make changes to your account.",
  summary: "Account summary",
  active: "Active account",
  inactive: "Inactive account",
  role: "Role",
  clinic: "Clinic",
  linkedDoctor: "Linked doctor",
  notLinked: "Not linked",
  lastAccess: "Last access",
  firstAccess: "First access",
  createdAt: "Account created",
  loginId: "Login identifier",
  profile: {
    title: "Personal details",
    description: "Information used to identify your account.",
    name: "Full name",
    email: "Email",
    save: "Save changes",
  },
  security: {
    title: "Security",
    description: "Change your account password.",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    submit: "Change password",
    show: "Show",
    hide: "Hide",
    showField: "Show {field}",
    hideField: "Hide {field}",
  },
  messages: {
    nameRequired: "Enter your full name.",
    emailInvalid: "Enter a valid email address.",
    currentRequired: "Enter your current password.",
    newLength: "The new password must be at least 8 characters long.",
    confirmRequired: "Confirm the new password.",
    confirmMismatch: "The confirmation does not match the new password.",
    profileSaved: "Personal details updated.",
    emailTaken: "A user with that email already exists in this clinic.",
    profileFailed: "Your details could not be updated. Please try again.",
    currentWrong: "The current password is incorrect.",
    sameAsCurrent: "The new password must be different from the current one.",
    passwordChanged: "Password changed. Your other sessions have been signed out.",
  },
};

export default account;
