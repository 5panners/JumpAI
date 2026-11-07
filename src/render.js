import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Renders one or two camera views side by side into the composer's buffer.
class SplitRenderPass extends Pass {
  constructor(scene, getViews) {
    super();
    this.scene = scene;
    this.getViews = getViews;
    this.needsSwap = false;
  }

  render(renderer, writeBuffer, readBuffer) {
    const rt = readBuffer;
    const W = rt.width, H = rt.height;
    rt.scissorTest = false;
    rt.viewport.set(0, 0, W, H);
    renderer.setRenderTarget(rt);
    renderer.clear();
    for (const v of this.getViews()) {
      const x = Math.round(v.x * W), w = Math.round(v.w * W);
      rt.viewport.set(x, 0, w, H);
      rt.scissor.set(x, 0, w, H);
      rt.scissorTest = true;
      renderer.setRenderTarget(rt);
      renderer.render(this.scene, v.camera);
    }
    rt.scissorTest = false;
    rt.viewport.set(0, 0, W, H);
    renderer.setRenderTarget(rt);
  }
}

const ColourShader = {
  uniforms: { tDiffuse: { value: null }, saturation: { value: 1 }, vignette: { value: 0.35 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float saturation; uniform float vignette; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vignette * dot(d, d) * 1.6;
      gl_FragColor = c;
    }`,
};

export function createRenderer(container, scene, getViews, { lowfx = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: !lowfx, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowfx ? 1 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !lowfx;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.addPass(new SplitRenderPass(scene, getViews));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.5, 0.9);
  if (!lowfx) composer.addPass(bloom);
  const colour = new ShaderPass(ColourShader);
  composer.addPass(colour);
  composer.addPass(new OutputPass());

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resize);

  return {
    renderer,
    composer,
    setSaturation(s) { colour.uniforms.saturation.value = s; },
    render() { composer.render(); },
  };
}
