import React, { forwardRef } from 'react';
import { FlatList } from 'react-native';
export const FlashList: any = forwardRef((props: any, ref) => (
  <FlatList {...props} ref={ref} />
));
export const MasonryFlashList = FlashList;
