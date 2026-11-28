// Minimal web/jsdom stubs for native-only expo modules (typing test only).
import React, { forwardRef } from 'react';
import { View } from 'react-native';
export const loadAsync = async () => {};
export const isLoaded = () => true;
export const useFonts = () => [true, false] as [boolean, boolean];
export const Font = { loadAsync, isLoaded };
export const MediaTypeOptions = { Images: 'Images', All: 'All', Videos: 'Videos' };
export const launchImageLibraryAsync = async () => ({ canceled: true });
export const launchCameraAsync = async () => ({ canceled: true });
export const requestMediaLibraryPermissionsAsync = async () => ({ granted: true, status: 'granted', canAskAgain: true });
export const requestCameraPermissionsAsync = async () => ({ granted: true, status: 'granted', canAskAgain: true });
export const getMediaLibraryPermissionsAsync = async () => ({ granted: true, status: 'granted', canAskAgain: true });
export const LinearGradient: any = forwardRef((props: any, _ref) => (
  <View style={[props.style, { backgroundColor: (props.colors && props.colors[0]) || 'transparent' }]}>{props.children}</View>
));
export const Speech = { speak: () => {}, stop: () => {}, isSpeakingAsync: async () => false, getMaxFileSizeAsync: async () => 0 };
export const speech = Speech;
export const isSpeakingAsync = Speech.isSpeakingAsync;
export const stop = Speech.stop;
export const speak = Speech.speak;
// expo-secure-store / expo-asset minimal stubs
export const getItemAsync = async () => null;
export const setItemAsync = async () => {};
export const deleteItemAsync = async () => {};
export const SecureStore = { getItemAsync, setItemAsync, deleteItemAsync };
export const Asset = { loadAsync: async () => ({}), downloadAsync: async () => ({}) };
export const useAssets = () => [true, false] as [boolean, boolean];
