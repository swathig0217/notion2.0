import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './tokens';

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
