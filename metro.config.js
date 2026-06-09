const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('webp');

// Exclure les fichiers zip du watcher (évite l'erreur EBUSY sur Windows)
config.watchFolders = [];
config.resolver.blockList = [
  /.*\.zip$/,
  /.*\.tar$/,
  /.*\.tar\.gz$/,
];

// Sur web : exclure les modules natifs qui n'ont pas de polyfill web
// (react-native-webview est une dépendance de react-native-signature-canvas)
const originalResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (
      moduleName === 'react-native-webview' ||
      moduleName === 'react-native-signature-canvas'
    ) {
      // Renvoie un module vide pour le web — FncScreen utilise SignatureWeb à la place
      return { type: 'empty' };
    }
  }
  if (originalResolver) return originalResolver(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

