/** Apply the application's required bindings consistently for validation and deploy. */
export function deploymentConfig(config) {
  return {
    ...config,
    images: { ...config.images, binding: "IMAGE_PROCESSOR" },
    triggers: {
      ...config.triggers,
      crons: [...new Set([...(config.triggers?.crons || []), "0 * * * *"])],
    },
  };
}
