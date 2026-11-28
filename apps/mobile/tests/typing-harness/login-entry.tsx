import React from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from './stubs/safe-area';
import { LoginOtpScreen } from '../../src/screens/customer/LoginOtpScreen';
const root = createRoot(document.getElementById('root')!);
root.render(<SafeAreaProvider><LoginOtpScreen /></SafeAreaProvider>);
