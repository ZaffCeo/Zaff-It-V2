const RNW = require('react-native-web');
module.exports = RNW;
module.exports.TurboModuleRegistry = { get: () => null, getEnforcing: () => ({}) };
if (!module.exports.I18nManager) module.exports.I18nManager = { isRTL: false, allowRTL: () => {}, forceRTL: () => {} };
