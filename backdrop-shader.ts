/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
const vs = `precision highp float;

in vec3 position;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`;

const fs = `precision highp float;

out vec4 fragmentColor;

uniform vec2 resolution;
uniform float time;
uniform float output_bass;

// Simple pseudo-random noise
float noise(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;
  float d = length(uv);

  // Base background: dark purple/blue gradient
  vec3 color = mix(vec3(0.1, 0.05, 0.2), vec3(0.0, 0.0, 0.0), d * 1.5);

  // Circular pulse rings reacting to AI voice bass
  float pulse_speed = 1.5;
  float pulse = sin((d - time * 0.2 * pulse_speed) * 30.0);
  pulse = smoothstep(0.8, 1.0, pulse);
  color += pulse * vec3(0.3, 0.1, 0.8) * (1.0 - d) * (0.5 + output_bass * 2.0);

  // Neon light trails
  float angle = atan(uv.y, uv.x);
  float trails = sin(angle * 6.0 + time * 0.5);
  trails = smoothstep(0.7, 1.0, trails);
  color += trails * vec3(0.1, 0.2, 0.5) * 0.2 * (1.0 - d * 0.8);

  // Add some noise/digital particles to background
  color += noise(uv * 1000.0) * 0.02;

  fragmentColor = vec4(color, 1.0);
}
`;

export {fs, vs};