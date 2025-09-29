/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:organize-imports
// tslint:disable:ban-malformed-import-paths
// tslint:disable:no-new-decorators

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Analyser} from './analyser';

import * as THREE from 'three';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {fs as backdropFS, vs as backdropVS} from './backdrop-shader';
import {vs as sphereVS} from './sphere-shader';

/**
 * 3D live audio visual.
 */
@customElement('gdm-live-audio-visuals-3d')
export class GdmLiveAudioVisuals3D extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private camera!: THREE.PerspectiveCamera;
  private backdrop!: THREE.Mesh;
  private composer!: EffectComposer;
  private sphere!: THREE.Mesh;
  private particles!: THREE.Points;
  private prevTime = 0;
  private rotation = new THREE.Vector3(0, 0, 0);
  private cameraBaseDistance = 5;
  private cameraTargetDistance = 5;

  private _outputNode!: AudioNode;

  @property()
  set outputNode(node: AudioNode) {
    this._outputNode = node;
    this.outputAnalyser = new Analyser(this._outputNode);
  }

  get outputNode() {
    return this._outputNode;
  }

  private _inputNode!: AudioNode;

  @property()
  set inputNode(node: AudioNode) {
    this._inputNode = node;
    this.inputAnalyser = new Analyser(this._inputNode);
  }

  get inputNode() {
    return this._inputNode;
  }

  private canvas!: HTMLCanvasElement;

  static styles = css`
    canvas {
      width: 100% !important;
      height: 100% !important;
      position: absolute;
      inset: 0;
      image-rendering: pixelated;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
  }

  private init() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x100c14);

    const backdrop = new THREE.Mesh(
      new THREE.IcosahedronGeometry(20, 5),
      new THREE.RawShaderMaterial({
        uniforms: {
          resolution: {value: new THREE.Vector2(1, 1)},
          time: {value: 0},
          output_bass: {value: 0},
        },
        vertexShader: backdropVS,
        fragmentShader: backdropFS,
        glslVersion: THREE.GLSL3,
      }),
    );
    backdrop.material.side = THREE.BackSide;
    scene.add(backdrop);
    this.backdrop = backdrop;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(2, -2, 5);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio / 1);

    // --- Floating Digital Particles ---
    const particleCount = 5000;
    const particlesGeometry = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const r = 8 + Math.random() * 8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      posArray[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      posArray[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      posArray[i * 3 + 2] = r * Math.cos(phi);
    }
    particlesGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(posArray, 3),
    );

    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.03,
      color: 0xaaccff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.5,
    });

    this.particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(this.particles);

    const geometry = new THREE.IcosahedronGeometry(1, 10);

    new EXRLoader().load('piz_compressed.exr', (texture: THREE.Texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
      sphereMaterial.envMap = exrCubeRenderTarget.texture;
      sphere.visible = true;
    });

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    // --- Holographic Sphere Material ---
    // FIX: Use `MeshPhysicalMaterial` to support the `transmission` property. `MeshStandardMaterial` does not have it.
    const sphereMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x101030,
      metalness: 0.2,
      roughness: 0.3,
      emissive: 0x202080,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9,
      transmission: 0.1, // Required to pass vWorldPosition to the shader
    });

    sphereMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = {value: 0};
      shader.uniforms.inputData = {value: new THREE.Vector4()};
      shader.uniforms.outputData = {value: new THREE.Vector4()};
      sphereMaterial.userData.shader = shader;

      shader.vertexShader = sphereVS;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `
        #include <common>
        uniform float time;
        uniform vec4 inputData;
        uniform vec4 outputData;
        `,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>

        // --- Futuristic AI Glow and Waves ---
        float fresnel = 1.0 - dot(normalize(vNormal), normalize(vViewPosition));
        fresnel = pow(fresnel, 3.0);
        vec3 fresnelColor = mix(vec3(0.5, 0.2, 1.0), vec3(0.2, 0.5, 1.0), fresnel);

        float totalAmp = outputData.x + inputData.x;
        float wavePattern = sin(vWorldPosition.y * 25.0 + time * 4.0) * cos(vWorldPosition.x * 25.0 + time * 4.0);
        wavePattern = smoothstep(0.7, 1.0, wavePattern);
        vec3 waveColor = vec3(0.9, 0.9, 1.0) * wavePattern * totalAmp * 0.6;

        gl_FragColor.rgb += fresnelColor * fresnel * (0.4 + totalAmp * 1.5);
        gl_FragColor.rgb += waveColor;
        `,
      );
    };

    const sphere = new THREE.Mesh(geometry, sphereMaterial);
    scene.add(sphere);
    sphere.visible = false;

    this.sphere = sphere;

    const renderPass = new RenderPass(scene, camera);

    // Soft holographic glow
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.0,
      0.5,
      0.1,
    );

    const fxaaPass = new ShaderPass(FXAAShader);

    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    this.composer = composer;

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      const dPR = renderer.getPixelRatio();
      const w = window.innerWidth;
      const h = window.innerHeight;
      (backdrop.material as THREE.RawShaderMaterial).uniforms.resolution.value.set(
        w * dPR,
        h * dPR,
      );
      renderer.setSize(w, h);
      composer.setSize(w, h);
      fxaaPass.material.uniforms['resolution'].value.set(
        1 / (w * dPR),
        1 / (h * dPR),
      );
    }

    window.addEventListener('resize', onWindowResize);
    onWindowResize();

    this.animation();
  }

  private animation() {
    requestAnimationFrame(() => this.animation());

    if (!this.inputAnalyser || !this.outputAnalyser) {
      return;
    }

    this.inputAnalyser.update();
    this.outputAnalyser.update();

    const t = performance.now();
    const dt = Math.min(3, (t - this.prevTime) / (1000 / 60));
    this.prevTime = t;

    const backdropMaterial = this.backdrop.material as THREE.RawShaderMaterial;
    // FIX: Update type cast to `MeshPhysicalMaterial`.
    const sphereMaterial = this.sphere.material as THREE.MeshPhysicalMaterial;

    backdropMaterial.uniforms.time.value = t / 1000;

    if (sphereMaterial.userData.shader) {
      const inputData = this.inputAnalyser.data;
      const outputData = this.outputAnalyser.data;

      const getAvg = (data: Uint8Array, start: number, end: number) => {
        let sum = 0;
        const count = end - start;
        if (count <= 0) return 0;
        for (let i = start; i < end; i++) {
          sum += data[i];
        }
        return sum / count / 255;
      };

      const inputLow = getAvg(inputData, 0, 3);
      const inputMid = getAvg(inputData, 4, 10);
      const inputHigh = getAvg(inputData, 11, 15);

      const outputLow = getAvg(outputData, 0, 3);
      const outputMid = getAvg(outputData, 4, 10);
      const outputHigh = getAvg(outputData, 11, 15);

      backdropMaterial.uniforms.output_bass.value = outputLow;

      this.particles.rotation.y += dt * 0.005;
      this.particles.rotation.z += dt * 0.002;
      (this.particles.material as THREE.PointsMaterial).opacity = Math.min(
        1.0,
        0.3 + outputLow * 1.5,
      );

      const targetScale = 1 + outputLow * 0.5 + outputMid * 0.2;
      const currentScale = this.sphere.scale.x;
      const newScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.1);
      this.sphere.scale.setScalar(newScale);

      const rotSpeed = 0.005;
      this.rotation.x += dt * rotSpeed * outputMid;
      this.rotation.y += dt * rotSpeed * (inputMid + outputMid) * 0.5;
      this.rotation.z += dt * rotSpeed * inputHigh * 2;

      this.cameraTargetDistance = this.cameraBaseDistance - outputLow * 1.5;
      const currentDistance = this.camera.position.length();
      const newDistance = THREE.MathUtils.lerp(
        currentDistance,
        this.cameraTargetDistance,
        0.05,
      );

      const euler = new THREE.Euler(
        this.rotation.x,
        this.rotation.y,
        this.rotation.z,
        'XYZ',
      );

      const cameraDirection = new THREE.Vector3(0, 0, 1).applyEuler(euler);
      this.camera.position.copy(cameraDirection.multiplyScalar(newDistance));

      this.camera.position.y += inputLow * 0.1 * Math.sin(t * 0.01);

      this.camera.lookAt(this.sphere.position);

      const shader = sphereMaterial.userData.shader;
      shader.uniforms.time.value += dt * 0.05 * (1 + outputLow);

      shader.uniforms.inputData.value.set(
        inputLow * 2.0,
        inputMid * 0.5,
        inputHigh * 20.0,
        0,
      );

      shader.uniforms.outputData.value.set(
        outputLow * 3.0,
        outputMid * 0.5,
        outputHigh * 20.0,
        0,
      );
    }

    this.composer.render();
  }

  protected firstUpdated() {
    this.canvas = this.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    this.init();
  }

  protected render() {
    return html`<canvas></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-3d': GdmLiveAudioVisuals3D;
  }
}
