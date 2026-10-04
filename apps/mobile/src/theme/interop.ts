import Animated from 'react-native-reanimated';
import { cssInterop } from 'nativewind';

// NativeWind only styles components it knows about. Register Reanimated's views so
// `className` works on them (skeletons, toasts).
cssInterop(Animated.View, { className: 'style' });
