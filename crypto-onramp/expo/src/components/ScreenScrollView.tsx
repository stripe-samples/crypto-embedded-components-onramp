import React, { ReactNode } from 'react';
import { ScrollView, StyleSheet, StyleProp, ViewStyle, ScrollViewProps } from 'react-native';

type Props = Omit<ScrollViewProps, 'style' | 'contentContainerStyle'> & {
  children: ReactNode;
  paddingTop?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export default function ScreenScrollView({ children, paddingTop = 48, style, contentStyle, ...rest }: Props) {
  return (
    <ScrollView
      style={[styles.container, style]}
      contentContainerStyle={[{ paddingHorizontal: 24, paddingTop, paddingBottom: 32 }, contentStyle]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
});
