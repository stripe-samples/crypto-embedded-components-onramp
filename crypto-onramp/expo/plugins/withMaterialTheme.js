const { withAndroidStyles } = require('@expo/config-plugins');

module.exports = function withMaterialTheme(config) {
  return withAndroidStyles(config, (config) => {
    const styles = config.modResults.resources.style;
    const appTheme = styles.find((s) => s.$.name === 'AppTheme');
    if (appTheme) {
      appTheme.$.parent = 'Theme.MaterialComponents.DayNight.NoActionBar';
    }
    return config;
  });
};
