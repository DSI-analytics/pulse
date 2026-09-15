import type { Messages } from "../types";
import account from "./en/account";
import agenda from "./en/agenda";
import appointmentStatus from "./en/appointmentStatus";
import audit from "./en/audit";
import auth from "./en/auth";
import catalog from "./en/catalog";
import charts from "./en/charts";
import clinical from "./en/clinical";
import consultations from "./en/consultations";
import dashboard from "./en/dashboard";
import doctors from "./en/doctors";
import finance from "./en/finance";
import insights from "./en/insights";
import patients from "./en/patients";
import permissions from "./en/permissions";
import plans from "./en/plans";
import reports from "./en/reports";
import services from "./en/services";
import stock from "./en/stock";
import suppliers from "./en/suppliers";
import users from "./en/users";

/** English dictionary. Must mirror `pt.ts` exactly — enforced by `tsc`. */
const en: Messages = {
  common: {
    save: "Save",
    saving: "Saving…",
    saved: "Changes saved.",
    cancel: "Cancel",
    close: "Close",
    create: "Create",
    edit: "Edit",
    delete: "Delete",
    back: "Back",
    active: "Active",
    inactive: "Inactive",
    yes: "Yes",
    no: "No",
    none: "None",
    optional: "Optional",
    loading: "Loading…",
    copy: "Copy",
    copied: "Copied",
    genericError: "The operation could not be completed. Please try again.",
    noPermission: "Your profile is not allowed to perform this action.",
    clinicFallback: "Clinic",
    appTitle: "Pulso — Clinic Management",
    appDescription: "Management and operational intelligence platform for clinics.",
    selectPlaceholder: "Select…",
    remove: "Delete",
    filter: "Filter",
    clear: "Clear",
    allOption: "{label}: All",
    print: "Print",
    requiredField: "Fill in the “{field}” field.",
    savedWithTitle: "{title} — saved successfully",
    recordUpdated: "Record updated successfully",
    recordDeleted: "Record deleted successfully",
    confirmDeleteRecord: "Are you sure you want to delete this record?",
    vsLastMonth: "vs. previous month",
    indicatorGroups: "Indicator groups",
    noStructuredData: "No structured data:",
  },

  nav: {
    groups: { operation: "Operations", management: "Management", system: "System" },
    dashboard: "Dashboard",
    agenda: "Schedule",
    patients: "Patients",
    consultations: "Consultations",
    doctors: "Doctors",
    healthPlans: "Health Plans",
    services: "Services & Tests",
    finance: "Finance",
    stock: "Stock",
    suppliers: "Suppliers",
    reports: "Reports",
    insights: "Insights",
    audit: "Audit",
    settings: "Settings",
    more: "More",
    expandSidebar: "Expand sidebar",
    collapseSidebar: "Collapse sidebar",
    expandShort: "Expand menu",
    collapseShort: "Collapse menu",
    mainNavigation: "Main navigation",
    navigation: "Navigation",
    search: {
      label: "Search",
      button: "Search…",
      placeholder: "Search patients, doctors, suppliers, plans…",
      hint: "Type to search across the whole clinic.",
      noResults: "No results.",
      types: { patient: "Patient", doctor: "Doctor", supplier: "Supplier", plan: "Plan" },
    },
    notifications: {
      title: "Notifications",
      markAllRead: "Mark as read",
      empty: "No notifications.",
    },
  },

  userMenu: {
    myAccount: "My account",
    appearance: "Appearance",
    signOut: "Sign out",
  },

  theme: {
    toggle: "Toggle theme",
  },

  roles: {
    SUPER_ADMIN: "Super Admin",
    CLINIC_ADMIN: "Administrator",
    CLINIC_MANAGER: "Clinic Manager",
    RECEPTIONIST: "Receptionist",
    DOCTOR: "Doctor",
    NURSE: "Nurse",
    LAB_TECHNICIAN: "Lab Technician",
    PHARMACIST: "Pharmacist",
    FINANCE: "Finance",
    INVENTORY_MANAGER: "Stock Manager",
  },

  noAccess: {
    title: "No access",
    body: "Your profile is not allowed to view this section. Please contact the clinic administrator.",
    back: "Back to dashboard",
  },

  settings: {
    title: "Settings",
    description: "Choose what you want to configure.",
    backToHub: "Settings",
    groups: {
      personal: "Personal",
      clinic: "Clinic",
    },
    adminOnly: "Administrators only",
    sections: {
      appearance: {
        title: "Appearance",
        description: "Theme, language, text size and animations — just for you.",
      },
      account: {
        title: "My account",
        description: "Name, email and password.",
      },
      clinic: {
        title: "Clinic details",
        description: "Name, tax ID, contacts, address, time zone and branches.",
      },
      regional: {
        title: "Currency & language",
        description: "Currency for amounts and the team's default language.",
      },
      users: {
        title: "Users",
        description: "Team accounts, roles and access.",
      },
      schedule: {
        title: "Schedule & alerts",
        description: "Consultation length and price; stock, expiry and receivables alerts.",
      },
      specialties: {
        title: "Specialties",
        description: "Medical specialties and the colours they are shown with.",
      },
      integrations: {
        title: "Integrations & API",
        description: "FHIR API clients and the online booking channel.",
      },
    },

    appearance: {
      themeLabel: "Theme",
      themeHint: "\"System\" follows your device's light/dark setting.",
      themes: { SYSTEM: "System", LIGHT: "Light", DARK: "Dark" },
      languageLabel: "Language",
      languageHint: "Interface language for your account.",
      languageClinicDefault: "Clinic language ({language})",
      textSizeLabel: "Text size",
      textSizes: { NORMAL: "Normal", LARGE: "Large" },
      motionLabel: "Reduce motion",
      motionHint: "Removes transitions and movement from the interface.",
      preview: "Preview",
      previewText: "This is how text and buttons look with your preferences.",
      saved: "Appearance preferences saved.",
    },

    clinic: {
      identity: "Identification",
      contacts: "Contacts & address",
      name: "Clinic name",
      nuit: "Tax ID (NUIT)",
      phone: "Phone",
      email: "Email",
      address: "Address",
      city: "City",
      country: "Country",
      timezone: "Time zone",
      timezoneHint: "Used across the schedule, reports and notifications.",
      saved: "Clinic details updated.",
      branches: "Branches",
      branchesEmpty: "No branches registered yet.",
      addBranch: "New branch",
      editBranch: "Edit branch",
      branchName: "Branch name",
      branchAddress: "Branch address",
      branchPhone: "Branch phone",
      branchMain: "Headquarters",
      setMain: "Make headquarters",
      branchSaved: "Branch saved.",
      branchDeleted: "Branch deleted.",
      confirmDeleteBranch: "Delete the branch \"{name}\"?",
      branchUsage: "{doctors} doctor(s) · {appointments} appointment(s)",
      errors: {
        name: "Enter the clinic name.",
        email: "Enter a valid email address.",
        timezone: "Choose a valid time zone.",
        branchName: "Enter the branch name.",
        branchDuplicate: "A branch with that name already exists.",
        branchInUse: "Cannot delete: the branch has linked doctors, appointments or encounters.",
        branchMain: "The headquarters cannot be deleted. Make another branch the headquarters first.",
      },
    },

    regional: {
      currencyLabel: "Currency",
      currencyHint: "Currency used to display every amount. Stored values are not converted.",
      localeLabel: "Default language",
      localeHint: "Applies to anyone who has not chosen a language under Appearance.",
      example: "Example",
      saved: "Currency and language updated.",
      errors: {
        currency: "Choose a valid currency.",
        locale: "Choose a valid language.",
      },
    },

    users: {
      intro: "Create accounts, assign roles and enable or disable access.",
    },

    schedule: {
      agenda: "Schedule",
      alerts: "Alerts",
      slotMinutes: "Default consultation length",
      slotMinutesHint: "Suggested when creating a new appointment.",
      consultationFee: "Default consultation price",
      consultationFeeHint: "Used when the service has no price of its own.",
      lowStockLeadDays: "Stock alert lead time",
      lowStockLeadDaysHint: "Warns when projected stock does not cover this many days.",
      expiryWarningDays: "Expiry warning",
      expiryWarningDaysHint: "Warns about batches expiring within this period.",
      receivableOverdueDays: "Overdue receivables",
      receivableOverdueDaysHint: "Invoices unpaid for longer than this are flagged.",
      minutes: "min",
      days: "days",
      saved: "Schedule and alerts updated.",
      errors: {
        slotMinutes: "Length must be between 5 and 240 minutes.",
        fee: "Enter a valid price.",
        days: "Enter a number of days between 1 and 365.",
      },
    },

    specialties: {
      add: "New specialty",
      empty: "No specialties registered yet.",
      name: "Name",
      color: "Colour",
      doctors: "{count} doctor(s)",
      saved: "Specialty saved.",
      deleted: "Specialty deleted.",
      confirmDelete: "Delete the specialty \"{name}\"?",
      inUse: "Cannot delete: there are doctors linked to this specialty.",
      editTitle: "Edit specialty",
      colors: {
        teal: "Teal",
        blue: "Blue",
        indigo: "Indigo",
        violet: "Violet",
        pink: "Pink",
        red: "Red",
        amber: "Amber",
        green: "Green",
      },
      errors: {
        name: "Enter the specialty name.",
        duplicate: "A specialty with that name already exists.",
      },
    },

    integrations: {
      statusTitle: "Integration status",
      fhirApi: "FHIR R4 API",
      fhirApiHint: "Clinical data exchange with other systems.",
      publicBooking: "Online booking",
      publicBookingHint: "Lets the clinic website look up availability and create appointments.",
      aiAssistant: "Insights assistant",
      aiAssistantHint: "Natural-language answers about your indicators.",
      configured: "Configured",
      notConfigured: "Not configured",
      activeClients: "{count} active client(s)",
      clientsTitle: "API clients",
      clientsEmpty: "No API clients yet.",
      addClient: "New client",
      clientName: "Client name",
      clientNameHint: "E.g. Clinic website, Partner laboratory.",
      scopes: "Permissions",
      expiresAt: "Expires on",
      never: "Never",
      expired: "Expired",
      revoked: "Revoked",
      lastUsed: "Last used",
      neverUsed: "Never used",
      createdAt: "Created on",
      revoke: "Revoke",
      confirmRevoke: "Revoke access for \"{name}\"? Requests using this token will stop working immediately.",
      revokedToast: "Access revoked.",
      tokenTitle: "Token created",
      tokenOnce: "Copy the token now. For security reasons it will not be shown again.",
      tokenDone: "I've copied it",
      scopeGroups: {
        fhir: "Clinical data (FHIR)",
        booking: "Online booking",
      },
      scopeLabels: {
        fhirRead: "Read all clinical resources",
        fhirWrite: "Create and update clinical resources",
        bookingRead: "Look up services and free slots",
        bookingWrite: "Create appointments",
      },
      status: "Status",
      token: "Token",
      errors: {
        name: "Enter the client name.",
        duplicate: "An API client with that name already exists.",
        scopes: "Choose at least one permission.",
        expiry: "The expiry date must be in the future.",
      },
    },
  },

  auth,
  account,
  users,
  permissions,
  dashboard,
  insights,
  reports,
  charts,
  agenda,
  consultations,
  appointmentStatus,
  patients,
  clinical,
  doctors,
  plans,
  services,
  catalog,
  finance,
  stock,
  suppliers,
  audit,
};

export default en;
