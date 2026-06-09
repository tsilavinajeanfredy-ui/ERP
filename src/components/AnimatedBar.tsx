import * as React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

type AnimatedBarProps = {
  /** Value between 0 and 100 representing percentage */
  value: number;
  /** Background color of the filled portion */
  color: string;
};

export default function AnimatedBar({ value, color }: AnimatedBarProps) {
  // Clamp value to [0, 100]
  const clamped = Math.max(0, Math.min(100, value));
  const width = useSharedValue(0);

  React.useEffect(() => {
    width.value = withTiming(clamped, { duration: 600 });
  }, [clamped, width]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
    backgroundColor: color,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.fill, animatedStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 6,
    backgroundColor: '#F1F3F5',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
