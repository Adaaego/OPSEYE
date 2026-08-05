/*
 * Central EmailJS configuration.
 *
 * Vite exposes environment variables prefixed with VITE_ through
 * import.meta.env. Keeping the configuration here prevents EmailJS IDs from
 * being repeated across components and invitation workflow files.
 *
 * Important:
 * These values are used by the browser application. Do not place passwords,
 * private API keys, Gmail credentials or other server-side secrets here.
 */

const normalizeConfigValue = (value) => {
    return String(value ?? "").trim();
  };
  
  /*
   * EmailJS configuration required when sending an invitation email.
   *
   * A single EmailJS template is used for every invitation type. JavaScript will
   * prepare different template values for region administrators, team members
   * and other organization users.
   */
  export const EMAILJS_CONFIG = Object.freeze({
    publicKey: normalizeConfigValue(
      import.meta.env.VITE_EMAILJS_PUBLIC_KEY
    ),
  
    serviceId: normalizeConfigValue(
      import.meta.env.VITE_EMAILJS_SERVICE_ID
    ),
  
    invitationTemplateId: normalizeConfigValue(
      import.meta.env.VITE_EMAILJS_INVITATION_TEMPLATE_ID
    ),
  });
  
  /*
   * The application URL is kept separately because it is used to build browser
   * invitation and post-verification links rather than to send the email itself.
   *
   * invitation-link-functions.js already falls back to window.location.origin
   * when this value is not configured.
   */
  export const APPLICATION_URL = normalizeConfigValue(
    import.meta.env.VITE_APP_URL
  );
  
  /*
   * User-friendly labels make configuration errors easier to understand than
   * displaying internal object property names such as "serviceId".
   */
  const CONFIGURATION_LABELS = Object.freeze({
    publicKey: "VITE_EMAILJS_PUBLIC_KEY",
    serviceId: "VITE_EMAILJS_SERVICE_ID",
    invitationTemplateId:
      "VITE_EMAILJS_INVITATION_TEMPLATE_ID",
  });
  
  /*
   * Returns the names of any required EmailJS environment variables that have not
   * been configured.
   *
   * This is exported so a development screen or diagnostic tool can inspect the
   * configuration without attempting to send an email.
   */
  export const getMissingEmailJsConfiguration = () => {
    return Object.entries(CONFIGURATION_LABELS)
      .filter(([configKey]) => !EMAILJS_CONFIG[configKey])
      .map(([, environmentVariable]) => environmentVariable);
  };
  
  /*
   * Validates the EmailJS configuration immediately before an email is sent.
   *
   * The application can start even when EmailJS is not configured, but invitation
   * delivery will fail with a clear message instead of passing empty IDs to the
   * EmailJS SDK.
   */
  export const requireEmailJsConfiguration = () => {
    const missingConfiguration =
      getMissingEmailJsConfiguration();
  
    if (missingConfiguration.length > 0) {
      throw new Error(
        `Missing EmailJS configuration: ${missingConfiguration.join(
          ", "
        )}. Check the project's .env file and restart the Vite server.`
      );
    }
  
    return EMAILJS_CONFIG;
  };