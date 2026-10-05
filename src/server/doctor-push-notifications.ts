import "server-only";

import { importPKCS8, SignJWT } from "jose";
import type { NotificationSeverity, NotificationType } from "@prisma/client";
import type { DoctorMobileContext } from "@/lib/doctor-mobile-auth";
import { prisma } from "@/lib/prisma";

export type DoctorNotificationCategory =
  | "appointments"
  | "checkIns"
  | "cancellations"
  | "clinicalAlerts"
  | "examResults"
  | "reminders";

export interface DoctorNotificationSettings {
  appointments: boolean;
  checkIns: boolean;
  cancellations: boolean;
  clinicalAlerts: boolean;
  examResults: boolean;
  reminders: boolean;
  pushEnabled: boolean;
}

const DEFAULT_SETTINGS: DoctorNotificationSettings = {
  appointments: true,
  checkIns: true,
  cancellations: true,
  clinicalAlerts: true,
  examResults: true,
  reminders: true,
  pushEnabled: true,
};

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function firebaseConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  return projectId && clientEmail && privateKey ? { projectId, clientEmail, privateKey } : null;
}

async function firebaseAccessToken() {
  const config = firebaseConfig();
  if (!config) return null;
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;

  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(config.privateKey, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(config.clientEmail)
    .setSubject(config.clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) return null;
  const result = await response.json() as { access_token?: string; expires_in?: number };
  if (!result.access_token) return null;
  cachedAccessToken = {
    value: result.access_token,
    expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000,
  };
  return result.access_token;
}

async function pushToUser(
  userId: string,
  title: string,
  body: string | null,
  data: Record<string, string>,
) {
  const config = firebaseConfig();
  const accessToken = await firebaseAccessToken();
  if (!config || !accessToken) return;
  const devices = await prisma.mobilePushDevice.findMany({
    where: { userId, isActive: true },
    select: { id: true, token: true },
  });
  await Promise.allSettled(devices.map(async (device) => {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: device.token,
          notification: { title, body: body ?? "" },
          data,
          android: {
            priority: "high",
            notification: {
              channel_id: "pulso_medico_alertas_v2",
              sound: "default",
              visibility: "PUBLIC",
              notification_priority: "PRIORITY_MAX",
              default_vibrate_timings: true,
            },
          },
          apns: { payload: { aps: { sound: "default", badge: 1 } } },
        },
      }),
    });
    if (response.status === 404 || response.status === 410) {
      await prisma.mobilePushDevice.update({ where: { id: device.id }, data: { isActive: false } });
    }
  }));
}

export async function notifyDoctor(input: {
  doctorId: string;
  clinicId: string;
  category: DoctorNotificationCategory;
  type: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  body?: string | null;
  entity?: string;
  entityId?: string;
}) {
  try {
    const doctor = await prisma.doctor.findFirst({
      where: { id: input.doctorId, clinicId: input.clinicId, status: "ACTIVO" },
      select: { userId: true },
    });
    if (!doctor?.userId) return;
    const preference = await prisma.doctorNotificationPreference.findUnique({ where: { userId: doctor.userId } });
    const settings = preference ?? DEFAULT_SETTINGS;
    if (!settings[input.category]) return;

    const notification = await prisma.notification.create({
      data: {
        clinicId: input.clinicId,
        userId: doctor.userId,
        type: input.type,
        severity: input.severity ?? "INFO",
        title: input.title,
        body: input.body ?? null,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
      },
      select: { id: true },
    });
    if (settings.pushEnabled) {
      await pushToUser(doctor.userId, input.title, input.body ?? null, {
        notificationId: notification.id,
        category: input.category,
        entity: input.entity ?? "",
        entityId: input.entityId ?? "",
      });
    }
  } catch {
    // Uma falha no canal de alertas nunca deve impedir o fluxo clínico principal.
  }
}

export async function getDoctorNotificationSettings(context: DoctorMobileContext): Promise<DoctorNotificationSettings> {
  const preference = await prisma.doctorNotificationPreference.findUnique({ where: { userId: context.userId } });
  return preference ?? DEFAULT_SETTINGS;
}

export async function updateDoctorNotificationSettings(
  context: DoctorMobileContext,
  settings: DoctorNotificationSettings,
) {
  return prisma.doctorNotificationPreference.upsert({
    where: { userId: context.userId },
    create: { userId: context.userId, ...settings },
    update: settings,
    select: {
      appointments: true, checkIns: true, cancellations: true, clinicalAlerts: true,
      examResults: true, reminders: true, pushEnabled: true,
    },
  });
}

export async function registerDoctorPushDevice(
  context: DoctorMobileContext,
  token: string,
  platform: "android" | "ios",
) {
  await prisma.mobilePushDevice.upsert({
    where: { token },
    create: { clinicId: context.clinicId, userId: context.userId, token, platform },
    update: { clinicId: context.clinicId, userId: context.userId, platform, isActive: true, lastSeenAt: new Date() },
  });
  return { ok: true } as const;
}

export async function deactivateDoctorPushDevice(context: DoctorMobileContext, token: string) {
  await prisma.mobilePushDevice.updateMany({
    where: { token, userId: context.userId, clinicId: context.clinicId },
    data: { isActive: false },
  });
  return { ok: true } as const;
}
