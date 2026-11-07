// Movement and feel tuning. Values follow the JumpAI design spec
// ("Controls and movement"), for a hero about 1 m tall.
export const GRAVITY = 30; // m/s^2 while rising
export const FALL_GRAVITY_MULT = 1.25; // heavier fall for snappier arcs
export const TERMINAL_FALL = -32;

const v = (peak) => Math.sqrt(2 * GRAVITY * peak);

export const MOVE = {
  runSpeed: 9, // m/s at full tilt
  accel: 15, // reaches full speed in 0.6 s
  groundDecel: 28,
  airControl: 0.4, // fraction of ground acceleration
  turnRateSlow: 16, // rad/s when slow
  turnRateFast: 7, // rad/s at full run
  skidTime: 0.25,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  chainWindow: 0.2, // time after landing to chain the next jump
  tripleMinSpeed: 7,
};

export const JUMP = {
  single: v(1.8),
  double: v(2.6),
  triple: v(4.2),
  backflip: v(3.8),
  backflipBack: -1.0,
  sideflip: v(3.4),
  sideflipSpeed: 3.5,
  longJumpUp: v(1.2),
  longJumpSpeed: 12.5,
  wallKickUp: v(2.4),
  wallKickOut: 6.5,
  wallKickWindow: 0.15,
  boostHeld: v(2.7 + 0.4), // 1.5x a single jump, measured from the partner's head
  boostCrouchUp: v(1.6),
  boostCrouchSpeed: 10,
  bounceSmall: v(0.7),
  stompBounce: v(1.4),
  stompBounceHeld: v(2.6),
  springSmall: v(6),
  springPound: v(10),
  cutFactor: 0.5, // tap = short hop
  waterLeap: v(2.1),
};

export const ACTION = {
  poundSpin: 0.22,
  poundSpeed: -25,
  poundRecover: 0.18,
  diveSpeed: 10.5,
  diveUp: 4.5,
  bellyFriction: 11,
  punchTime: 0.28,
  punchRange: 1.4,
  slideMinSpeed: 6,
  slideFriction: 5,
  rollSpeed: 11.5, // Bram's Curl Roll
  rollTime: 1.0,
  glideFall: -4.0, // Tali's Scarf Glide (half fall speed)
  glideTime: 1.2,
  tossUp: 17,
  tossForward: 8,
  tossForwardUp: 12,
  twinPoundWindow: 0.25,
  twinPoundRadius: 8,
};

export const HEALTH = {
  max: 6,
  fallDamageHeight: 6,
  invuln: 1.4,
  airMax: 30, // seconds underwater
};

export const WATER_LEVEL = 0;

export const CAMERA = {
  pitch: 0.36,
  minDist: 9,
  maxDist: 22,
  splitAt: 25,
  mergeAt: 21,
  orbitSpeed: 2.4,
};

export const HERO_RADIUS = 0.4;
export const HERO_HEIGHT = 1.1;
