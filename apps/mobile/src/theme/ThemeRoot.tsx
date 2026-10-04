import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { View, useColorScheme } from 'react-native';
import { vars } from 'nativewind';
import { cssVars, dark, light } from './tokens';

const lightVars = vars(cssVars(light));
const darkVars = vars(cssVars(dark));

/** Sets the color CSS variables for the current scheme on the app root. */
export function ThemeRoot({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const style = useMemo(() => [{ flex: 1 }, scheme === 'dark' ? darkVars : lightVars], [scheme]);
  return (
    <View style={style} className="bg-bg">
      {children}
    </View>
  );
}
