import React from 'react';
import { View } from 'react-native';
export const SafeAreaProvider: React.FC<{children?: any}> = ({ children }) => <View>{children}</View>;
export const SafeAreaView: React.FC<any> = ({ children, ...rest }) => <View {...rest}>{children}</View>;
export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
export const SafeAreaInsetsContext = React.createContext({ top: 0, bottom: 0, left: 0, right: 0 });
export const SafeAreaFrameContext = React.createContext({ x: 0, y: 0, width: 0, height: 0 });
export const initialWindowMetrics = { frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };
