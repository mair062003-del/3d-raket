import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Coins, Gauge, Globe2, RotateCcw, Rocket, ShieldAlert, ShieldCheck, Store, Wrench, X, Zap } from 'lucide-react'
import './App.css'

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand: () => void
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy') => void
        }
        MainButton?: {
          setText: (text: string) => void
          show: () => void
          hide: () => void
          onClick: (cb: () => void) => void
        }
      }
    }
  }
}

type GamePhase = 'ready' | 'flying' | 'space' | 'danger' | 'crashed'
type ObstacleKind = 'comet' | 'planet'
type PlanetInfo = {
  name: string
  color: string
  emissive: string
  story: string
  hasRing?: boolean
}
type Obstacle = {
  group: THREE.Group
  kind: ObstacleKind
  radius: number
  drift: number
  spin: number
  planet?: PlanetInfo
}
type UpgradeKey = 'engine' | 'maneuver' | 'shield'
type Upgrades = Record<UpgradeKey, number>
type UpgradeInfo = {
  key: UpgradeKey
  title: string
  description: string
  baseCost: number
  icon: typeof Zap
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const MAX_UPGRADE_LEVEL = 5
const STORAGE_KEY = '3d-raket-progress'
const DEFAULT_UPGRADES: Upgrades = { engine: 0, maneuver: 0, shield: 0 }
const KEYBOARD_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'])
const PLAYER_BOUNDS = {
  xGround: 2.45,
  xSpace: 4.25,
  yGround: 1.65,
  ySpace: 2.45,
  zGround: 0.45,
  zSpace: 0.85,
}
const UPGRADE_LIST: UpgradeInfo[] = [
  {
    key: 'engine',
    title: 'Двигатель',
    description: 'Больше ускорение и максимальная скорость',
    baseCost: 4,
    icon: Zap,
  },
  {
    key: 'maneuver',
    title: 'Манёвренность',
    description: 'Ракета быстрее уходит от комет пальцем',
    baseCost: 4,
    icon: Gauge,
  },
  {
    key: 'shield',
    title: 'Щит',
    description: 'В каждом полёте держит удар одной кометы',
    baseCost: 6,
    icon: ShieldCheck,
  },
]

const getUpgradeCost = (upgrade: UpgradeInfo, level: number) => upgrade.baseCost + level * 3

const loadProgress = () => {
  if (typeof window === 'undefined') {
    return { coins: 0, upgrades: DEFAULT_UPGRADES }
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return { coins: 0, upgrades: DEFAULT_UPGRADES }
    const parsed = JSON.parse(saved) as Partial<{ coins: number; upgrades: Partial<Upgrades> }>
    return {
      coins: Math.max(0, Math.floor(parsed.coins ?? 0)),
      upgrades: {
        engine: clamp(Math.floor(parsed.upgrades?.engine ?? 0), 0, MAX_UPGRADE_LEVEL),
        maneuver: clamp(Math.floor(parsed.upgrades?.maneuver ?? 0), 0, MAX_UPGRADE_LEVEL),
        shield: clamp(Math.floor(parsed.upgrades?.shield ?? 0), 0, MAX_UPGRADE_LEVEL),
      },
    }
  } catch {
    return { coins: 0, upgrades: DEFAULT_UPGRADES }
  }
}

const PLANETS: PlanetInfo[] = [
  {
    name: 'Меркурий',
    color: '#a3a3a3',
    emissive: '#27272a',
    story: 'Меркурий — самая близкая к Солнцу планета. У него почти нет атмосферы, поэтому днём поверхность раскаляется, а ночью резко остывает.',
  },
  {
    name: 'Венера',
    color: '#facc15',
    emissive: '#78350f',
    story: 'Венера похожа на Землю размером, но покрыта плотными облаками серной кислоты. Это самая горячая планета Солнечной системы.',
  },
  {
    name: 'Земля',
    color: '#0ea5e9',
    emissive: '#082f49',
    story: 'Земля — наш дом и единственная известная планета с жизнью. Большую часть поверхности покрывают океаны, а атмосфера защищает нас от космоса.',
  },
  {
    name: 'Марс',
    color: '#ef4444',
    emissive: '#7f1d1d',
    story: 'Марс называют Красной планетой из-за оксида железа в грунте. На нём есть огромный вулкан Олимп и следы древней воды.',
  },
  {
    name: 'Юпитер',
    color: '#f97316',
    emissive: '#7c2d12',
    story: 'Юпитер — крупнейшая планета Солнечной системы. Его Большое красное пятно — гигантский шторм, который бушует уже сотни лет.',
  },
  {
    name: 'Сатурн',
    color: '#fde68a',
    emissive: '#78350f',
    hasRing: true,
    story: 'Сатурн знаменит яркими кольцами из льда и каменной пыли. Это газовый гигант, настолько лёгкий, что теоретически мог бы плавать в воде.',
  },
  {
    name: 'Уран',
    color: '#67e8f9',
    emissive: '#164e63',
    story: 'Уран вращается почти лёжа на боку. Его голубой цвет связан с метаном в атмосфере, который поглощает красный свет.',
  },
  {
    name: 'Нептун',
    color: '#2563eb',
    emissive: '#1e3a8a',
    story: 'Нептун — далёкий ледяной гигант с очень сильными ветрами. Это самая дальняя большая планета от Солнца.',
  },
  {
    name: 'Плутон',
    color: '#d6d3d1',
    emissive: '#44403c',
    story: 'Плутон — карликовая планета в поясе Койпера. У него есть большое сердцеобразное ледяное пятно и спутник Харон.',
  },
  {
    name: 'Церера',
    color: '#a8a29e',
    emissive: '#292524',
    story: 'Церера — карликовая планета в главном поясе астероидов. На её поверхности есть яркие соляные пятна.',
  },
  {
    name: 'Эрида',
    color: '#e5e7eb',
    emissive: '#374151',
    story: 'Эрида — одна из самых массивных карликовых планет за орбитой Нептуна. Её открытие помогло пересмотреть статус Плутона.',
  },
  {
    name: 'Макемаке',
    color: '#fb7185',
    emissive: '#881337',
    story: 'Макемаке — холодная карликовая планета пояса Койпера. На ней так далеко от Солнца, что метан замерзает на поверхности.',
  },
  {
    name: 'Хаумеа',
    color: '#f8fafc',
    emissive: '#475569',
    hasRing: true,
    story: 'Хаумеа вращается очень быстро и поэтому вытянута, как мяч для регби. У неё есть кольцо и два известных спутника.',
  },
  {
    name: 'Седна',
    color: '#f97316',
    emissive: '#7c2d12',
    story: 'Седна — очень далёкий транснептуновый объект. Один оборот вокруг Солнца занимает у неё тысячи земных лет.',
  },
  {
    name: 'Орк',
    color: '#cbd5e1',
    emissive: '#334155',
    story: 'Орк — крупный объект пояса Койпера. Его иногда называют анти-Плутоном, потому что его орбита похожа, но расположена иначе.',
  },
  {
    name: 'Квавар',
    color: '#f59e0b',
    emissive: '#78350f',
    hasRing: true,
    story: 'Квавар — далёкий объект за Нептуном. Астрономы обнаружили у него необычное кольцо, которое находится дальше ожидаемого.',
  },
  {
    name: 'Гунгун',
    color: '#dc2626',
    emissive: '#7f1d1d',
    story: 'Гунгун — далёкий ледяной мир с красноватой поверхностью. Его цвет может быть связан с органическими веществами, изменёнными излучением.',
  },
  {
    name: 'Веста',
    color: '#d4d4d8',
    emissive: '#3f3f46',
    story: 'Веста — один из крупнейших объектов пояса астероидов. На ней есть огромный кратер, оставленный древним столкновением.',
  },
  {
    name: 'Проксима b',
    color: '#22c55e',
    emissive: '#14532d',
    story: 'Проксима Центавра b — экзопланета у ближайшей к Солнцу звезды. Она находится в зоне, где теоретически может существовать жидкая вода.',
  },
  {
    name: 'TRAPPIST-1e',
    color: '#38bdf8',
    emissive: '#075985',
    story: 'TRAPPIST-1e — экзопланета в системе из семи каменных миров. Она интересна учёным как возможный кандидат на похожие на земные условия.',
  },
  {
    name: 'Kepler-452b',
    color: '#84cc16',
    emissive: '#365314',
    story: 'Kepler-452b иногда называют старшим кузеном Земли. Она обращается вокруг звезды, похожей на Солнце, но находится очень далеко от нас.',
  },
  {
    name: 'Kepler-22b',
    color: '#06b6d4',
    emissive: '#164e63',
    story: 'Kepler-22b — одна из первых найденных планет в обитаемой зоне своей звезды. Её точный состав пока остаётся загадкой.',
  },
  {
    name: '55 Рака e',
    color: '#fef08a',
    emissive: '#854d0e',
    story: '55 Рака e — сверхземля, которая обращается очень близко к своей звезде. Там настолько жарко, что поверхность может быть расплавленной.',
  },
  {
    name: 'HD 189733 b',
    color: '#1d4ed8',
    emissive: '#172554',
    story: 'HD 189733 b — ярко-синий газовый гигант. На нём дуют чудовищные ветры, а в атмосфере могут идти стеклянные дожди.',
  },
  {
    name: 'WASP-12b',
    color: '#a855f7',
    emissive: '#581c87',
    story: 'WASP-12b — горячий Юпитер, который звезда постепенно растягивает и разрушает. Его форма может напоминать яйцо.',
  },
  {
    name: 'TOI-700 d',
    color: '#14b8a6',
    emissive: '#134e4a',
    story: 'TOI-700 d — экзопланета размером примерно с Землю в обитаемой зоне красного карлика. Это один из интересных миров для будущих наблюдений.',
  },
  {
    name: 'LHS 1140 b',
    color: '#60a5fa',
    emissive: '#1e3a8a',
    story: 'LHS 1140 b — плотная каменная экзопланета у красного карлика. Учёные считают её хорошей целью для поиска атмосферы.',
  },
  {
    name: 'GJ 1214 b',
    color: '#7dd3fc',
    emissive: '#0c4a6e',
    story: 'GJ 1214 b называют водным мини-Нептуном. Его атмосфера закрыта облаками или дымкой, поэтому изучать его непросто.',
  },
]


function createRocket() {
  const rocket = new THREE.Group()
  rocket.name = 'rocket'

  const whiteMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', metalness: 0.42, roughness: 0.22 })
  const blackMat = new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.45, roughness: 0.28 })
  const orangeMat = new THREE.MeshStandardMaterial({ color: '#f97316', emissive: '#7c2d12', emissiveIntensity: 0.18, metalness: 0.18, roughness: 0.34 })
  const redMat = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#7f1d1d', emissiveIntensity: 0.12, metalness: 0.18, roughness: 0.32 })
  const blueMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.42, metalness: 0.15, roughness: 0.12 })
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#d1d5db', metalness: 0.9, roughness: 0.14 })
  const darkChromeMat = new THREE.MeshStandardMaterial({ color: '#374151', metalness: 0.82, roughness: 0.2 })
  const flameMat = new THREE.MeshStandardMaterial({ color: '#f97316', emissive: '#fb923c', emissiveIntensity: 2.1, transparent: true, opacity: 0.92 })
  const goldMat = new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#854d0e', emissiveIntensity: 0.18, metalness: 0.55, roughness: 0.26 })

  const firstStage = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 2.15, 64), whiteMat)
  firstStage.position.y = -0.28
  rocket.add(firstStage)

  const bellyShadow = new THREE.Mesh(new THREE.CylinderGeometry(0.485, 0.56, 2.08, 64, 1, true, 0, Math.PI * 0.78), new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.36, roughness: 0.32 }))
  bellyShadow.position.set(0, -0.29, -0.02)
  bellyShadow.rotation.y = Math.PI * 0.61
  rocket.add(bellyShadow)

  const upperStage = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 1.1, 64), whiteMat)
  upperStage.position.y = 1.18
  rocket.add(upperStage)

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.39, 0.82, 64), redMat)
  nose.position.y = 2.15
  rocket.add(nose)

  const interstage = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 64), blackMat)
  interstage.position.y = 0.55
  rocket.add(interstage)

  const lowerBand = new THREE.Mesh(new THREE.CylinderGeometry(0.585, 0.6, 0.13, 64), blackMat)
  lowerBand.position.y = -1.25
  rocket.add(lowerBand)

  const tankBand = new THREE.Mesh(new THREE.CylinderGeometry(0.505, 0.505, 0.055, 64), chromeMat)
  tankBand.position.y = -0.05
  rocket.add(tankBand)

  const windowFrame = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 16, 48), blackMat)
  windowFrame.position.set(0, 1.35, 0.385)
  rocket.add(windowFrame)

  const windowGlass = new THREE.Mesh(new THREE.CircleGeometry(0.135, 48), blueMat)
  windowGlass.position.set(0, 1.35, 0.425)
  rocket.add(windowGlass)

  const windowGlint = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24), new THREE.MeshStandardMaterial({ color: '#f8fafc', emissive: '#bae6fd', emissiveIntensity: 0.8, transparent: true, opacity: 0.82 }))
  windowGlint.position.set(-0.045, 1.39, 0.435)
  rocket.add(windowGlint)

  for (const angle of [Math.PI / 2, -Math.PI / 2]) {
    const porthole = new THREE.Group()
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 12, 32), blackMat)
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.067, 32), blueMat)
    glass.position.z = 0.018
    porthole.add(frame, glass)
    porthole.position.set(Math.sin(angle) * 0.485, 0.42, Math.cos(angle) * 0.485)
    porthole.rotation.y = angle
    rocket.add(porthole)
  }

  for (const y of [0.92, 0.18, -0.58]) {
    const serviceLine = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.48, 0.018), chromeMat)
    serviceLine.position.set(0.5, y, 0.02)
    serviceLine.rotation.z = -0.03
    rocket.add(serviceLine)
  }

  for (const side of [-1, 1]) {
    const booster = new THREE.Group()
    const boosterBody = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.35, 40), whiteMat)
    boosterBody.position.y = -0.42
    booster.add(boosterBody)

    const boosterNose = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.46, 40), orangeMat)
    boosterNose.position.y = 0.98
    booster.add(boosterNose)

    const boosterNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.25, 36), darkChromeMat)
    boosterNozzle.position.y = -1.7
    booster.add(boosterNozzle)

    const boosterStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.205, 0.11, 40), redMat)
    boosterStripe.position.y = -0.18
    booster.add(boosterStripe)

    const clampTop = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.08), chromeMat)
    clampTop.position.set(-side * 0.21, 0.48, 0)
    booster.add(clampTop)

    const clampBottom = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.08), chromeMat)
    clampBottom.position.set(-side * 0.21, -0.85, 0)
    booster.add(clampBottom)

    booster.position.set(side * 0.72, -0.35, 0)
    rocket.add(booster)
  }

  for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    const finShape = new THREE.Shape()
    finShape.moveTo(0, 0.18)
    finShape.lineTo(0.44, -0.52)
    finShape.lineTo(0.11, -0.45)
    finShape.lineTo(0, 0.18)
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 2 }), redMat)
    fin.position.y = -1.28
    fin.rotation.y = angle
    fin.position.x = Math.sin(angle) * 0.52
    fin.position.z = Math.cos(angle) * 0.52
    rocket.add(fin)
  }

  const engineMount = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.24, 64), darkChromeMat)
  engineMount.position.y = -1.48
  rocket.add(engineMount)

  const heatShield = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.045, 16, 64), goldMat)
  heatShield.position.y = -1.36
  heatShield.rotation.x = Math.PI / 2
  rocket.add(heatShield)

  const enginePositions = [
    [0, 0],
    [0.22, 0.16],
    [-0.22, 0.16],
    [0.22, -0.16],
    [-0.22, -0.16],
  ] as const
  enginePositions.forEach(([x, z], index) => {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, index === 0 ? 0.17 : 0.13, 0.34, 32), blackMat)
    nozzle.position.set(x, -1.72, z)
    rocket.add(nozzle)
  })

  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.25, 36), flameMat)
  flame.name = 'flame'
  flame.position.y = -2.35
  flame.rotation.x = Math.PI
  rocket.add(flame)

  return rocket
}

function createStars(count = 900, spread = 70, ySpread = 120, color = '#e0f2fe', size = 0.06, opacity = 0.9) {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * spread
    positions[i * 3 + 1] = Math.random() * ySpread - 20
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({ color, size, transparent: true, opacity, sizeAttenuation: true })
  return new THREE.Points(geometry, material)
}

function createNebulaTexture(colorA: string, colorB: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) return null

  const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 126)
  gradient.addColorStop(0, colorA)
  gradient.addColorStop(0.42, colorB)
  gradient.addColorStop(1, 'rgba(2, 6, 23, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 256)

  for (let i = 0; i < 70; i += 1) {
    context.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.07})`
    context.beginPath()
    context.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 5, 0, Math.PI * 2)
    context.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createNebula(colorA: string, colorB: string) {
  const texture = createNebulaTexture(colorA, colorB)
  const material = new THREE.SpriteMaterial({
    map: texture ?? undefined,
    color: texture ? '#ffffff' : colorA,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(18, 11, 1)
  return sprite
}

function createDistantPlanet(color: string, emissive: string, radius: number, ring = false) {
  const group = new THREE.Group()
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 48),
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.48, roughness: 0.68 }),
  )
  group.add(sphere)

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.05, 48, 48),
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.75, transparent: true, opacity: 0.18, roughness: 1 }),
  )
  group.add(atmosphere)

  if (ring) {
    const planetRing = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.42, radius * 0.045, 12, 96),
      new THREE.MeshStandardMaterial({ color: '#fde68a', emissive: '#a16207', emissiveIntensity: 0.38, transparent: true, opacity: 0.68 }),
    )
    planetRing.rotation.x = Math.PI / 2.6
    planetRing.rotation.z = Math.PI / 8
    group.add(planetRing)
  }

  return group
}

function createCometStreak() {
  const group = new THREE.Group()
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 18, 18),
    new THREE.MeshStandardMaterial({ color: '#fef3c7', emissive: '#f97316', emissiveIntensity: 1.9 }),
  )
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 2.7, 18),
    new THREE.MeshStandardMaterial({ color: '#fbbf24', emissive: '#fb923c', emissiveIntensity: 1.7, transparent: true, opacity: 0.42 }),
  )
  tail.position.y = -1.3
  tail.rotation.x = Math.PI
  group.add(core, tail)
  group.rotation.z = Math.PI / 5
  return group
}

function createComet() {
  const group = new THREE.Group()
  group.name = 'comet'
  const core = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.54, 1),
    new THREE.MeshStandardMaterial({ color: '#f59e0b', emissive: '#7c2d12', emissiveIntensity: 0.55, roughness: 0.8 }),
  )
  group.add(core)

  const tailMat = new THREE.MeshStandardMaterial({ color: '#fb923c', emissive: '#f97316', emissiveIntensity: 1.5, transparent: true, opacity: 0.74 })
  for (let i = 0; i < 3; i += 1) {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18 + i * 0.05, 1.8 + i * 0.32, 18), tailMat.clone())
    tail.position.set((i - 1) * 0.16, -0.85 - i * 0.18, -0.18 * i)
    tail.rotation.x = Math.PI
    group.add(tail)
  }

  return group
}


function createPlanet(planet: PlanetInfo) {
  const group = new THREE.Group()
  group.name = `planet-${planet.name}`
  const material = new THREE.MeshStandardMaterial({
    color: planet.color,
    emissive: planet.emissive,
    emissiveIntensity: 0.42,
    roughness: 0.62,
    metalness: 0.05,
  })
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.76, 42, 42), material)
  group.add(sphere)

  const lineMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.18 })
  for (const y of [-0.28, 0, 0.28]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.77, 0.012, 8, 80), lineMat.clone())
    band.rotation.x = Math.PI / 2
    band.position.y = y
    group.add(band)
  }

  if (planet.hasRing) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.08, 0.055, 12, 96),
      new THREE.MeshStandardMaterial({ color: '#fde68a', emissive: '#92400e', emissiveIntensity: 0.38, transparent: true, opacity: 0.82 }),
    )
    ring.rotation.x = Math.PI / 2.8
    ring.rotation.z = Math.PI / 7
    group.add(ring)
  }

  return group
}

function placeObstacle(obstacle: Obstacle, rocketY: number, index: number) {
  obstacle.group.position.set((Math.random() - 0.5) * 5.2, rocketY + 8 + index * 4.5 + Math.random() * 20, (Math.random() - 0.5) * 1.8)
  obstacle.group.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const boostRef = useRef(false)
  const steerRef = useRef({ x: 0, y: 0 })
  const keyboardRef = useRef({ x: 0, y: 0 })
  const playerOffsetRef = useRef({ x: 0, y: 0, z: 0 })
  const phaseRef = useRef<GamePhase>('ready')
  const storyOpenRef = useRef(false)
  const shopOpenRef = useRef(false)
  const upgradesRef = useRef<Upgrades>(DEFAULT_UPGRADES)
  const shieldChargeRef = useRef(0)
  const [progressLoaded] = useState(loadProgress)
  const [phase, setPhase] = useState<GamePhase>('ready')
  const [altitude, setAltitude] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [score, setScore] = useState(0)
  const [coins, setCoins] = useState(progressLoaded.coins)
  const [upgrades, setUpgrades] = useState<Upgrades>(progressLoaded.upgrades)
  const [shieldCharge, setShieldCharge] = useState(0)
  const [shopOpen, setShopOpen] = useState(false)
  const [dangerScore, setDangerScore] = useState(0)
  const [planetStory, setPlanetStory] = useState<PlanetInfo | null>(null)
  const [hint, setHint] = useState('Нажми СТАРТ и удерживай ускорение')

  const setGamePhase = (next: GamePhase) => {
    phaseRef.current = next
    setPhase(next)
  }

  const openShop = () => {
    shopOpenRef.current = true
    boostRef.current = false
    setShopOpen(true)
  }

  const closeShop = () => {
    shopOpenRef.current = false
    setShopOpen(false)
    boostRef.current = phaseRef.current === 'space' || phaseRef.current === 'danger'
  }

  const buyUpgrade = (upgrade: UpgradeInfo) => {
    const level = upgrades[upgrade.key]
    const cost = getUpgradeCost(upgrade, level)
    if (level >= MAX_UPGRADE_LEVEL || coins < cost) return

    setCoins((current) => current - cost)
    setUpgrades((current) => {
      const next = { ...current, [upgrade.key]: current[upgrade.key] + 1 }
      upgradesRef.current = next
      if (upgrade.key === 'shield' && phaseRef.current === 'ready') {
        shieldChargeRef.current = next.shield > 0 ? 1 : 0
        setShieldCharge(shieldChargeRef.current)
      }
      return next
    })
    setHint(`${upgrade.title}: уровень ${level + 1}`)
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light')
  }

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    tg?.ready?.()
    tg?.expand?.()
  }, [])

  useEffect(() => {
    const pressed = new Set<string>()

    const syncKeyboard = () => {
      keyboardRef.current = {
        x: Number(pressed.has('KeyD') || pressed.has('ArrowRight')) - Number(pressed.has('KeyA') || pressed.has('ArrowLeft')),
        y: Number(pressed.has('KeyW') || pressed.has('ArrowUp')) - Number(pressed.has('KeyS') || pressed.has('ArrowDown')),
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!KEYBOARD_CODES.has(event.code)) return
      event.preventDefault()
      pressed.add(event.code)
      syncKeyboard()
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!KEYBOARD_CODES.has(event.code)) return
      event.preventDefault()
      pressed.delete(event.code)
      syncKeyboard()
    }

    const clearKeyboard = () => {
      pressed.clear()
      syncKeyboard()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', clearKeyboard)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', clearKeyboard)
    }
  }, [])

  useEffect(() => {
    upgradesRef.current = upgrades
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ coins, upgrades }))
    } catch {
      // Telegram WebView can deny storage in restricted modes; gameplay should still run.
    }
  }, [coins, upgrades])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2('#050816', 0.018)

    const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.1, 1000)
    camera.position.set(0, 2.2, 7.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const ambient = new THREE.AmbientLight('#93c5fd', 0.86)
    scene.add(ambient)
    const sun = new THREE.DirectionalLight('#ffffff', 2.4)
    sun.position.set(6, 8, 6)
    scene.add(sun)
    const rimLight = new THREE.DirectionalLight('#a78bfa', 1.2)
    rimLight.position.set(-7, 5, -4)
    scene.add(rimLight)
    const engineLight = new THREE.PointLight('#fb923c', 3, 8)
    scene.add(engineLight)

    const nearStars = createStars(950, 70, 120, '#f8fafc', 0.052, 0.92)
    const midStars = createStars(1250, 120, 170, '#bfdbfe', 0.04, 0.62)
    const farStars = createStars(1700, 210, 230, '#c4b5fd', 0.025, 0.45)
    scene.add(nearStars, midStars, farStars)

    const nebulaA = createNebula('rgba(168, 85, 247, 0.56)', 'rgba(14, 165, 233, 0.24)')
    nebulaA.position.set(-11, 24, -22)
    scene.add(nebulaA)
    const nebulaB = createNebula('rgba(20, 184, 166, 0.42)', 'rgba(244, 114, 182, 0.2)')
    nebulaB.position.set(12, 58, -28)
    nebulaB.scale.set(22, 13, 1)
    scene.add(nebulaB)

    const distantPlanets = [
      createDistantPlanet('#7dd3fc', '#075985', 1.25),
      createDistantPlanet('#fda4af', '#881337', 0.88, true),
      createDistantPlanet('#fef08a', '#854d0e', 0.62),
    ]
    distantPlanets[0].position.set(-8, 18, -15)
    distantPlanets[1].position.set(9, 45, -21)
    distantPlanets[2].position.set(-12, 76, -18)
    distantPlanets.forEach((planet) => scene.add(planet))

    const cometStreaks = Array.from({ length: 4 }, (_, index) => {
      const streak = createCometStreak()
      streak.position.set((Math.random() - 0.5) * 24, 26 + index * 23, -13 - Math.random() * 12)
      streak.scale.setScalar(0.75 + Math.random() * 0.55)
      scene.add(streak)
      return streak
    })

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(5.8, 64, 64),
      new THREE.MeshStandardMaterial({ color: '#0ea5e9', emissive: '#082f49', emissiveIntensity: 0.45, roughness: 0.7 }),
    )
    earth.position.y = -7
    scene.add(earth)

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.6, 0.35, 48),
      new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.45, roughness: 0.4 }),
    )
    pad.position.y = -2.35
    scene.add(pad)

    const rocket = createRocket()
    rocket.position.y = -0.35
    scene.add(rocket)
    const flame = rocket.getObjectByName('flame') as THREE.Mesh | undefined

    const obstacles: Obstacle[] = Array.from({ length: 36 }, (_, index) => {
      const kind: ObstacleKind = index % 2 === 0 ? 'planet' : 'comet'
      const planet = kind === 'planet' ? PLANETS[(index / 2) % PLANETS.length | 0] : undefined
      const group = kind === 'planet' && planet ? createPlanet(planet) : createComet()
      group.visible = false
      scene.add(group)
      return {
        group,
        kind,
        radius: kind === 'planet' ? 1.12 : 0.72,
        drift: (Math.random() - 0.5) * 0.9,
        spin: 0.8 + Math.random() * 1.8,
        planet,
      }
    })

    const smokeParticles: THREE.Mesh[] = []
    const smokeMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', transparent: true, opacity: 0.22, roughness: 1 })
    for (let i = 0; i < 28; i += 1) {
      const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.18 + Math.random() * 0.2, 12, 12), smokeMat.clone())
      smoke.position.set((Math.random() - 0.5) * 1.6, -2.7 - Math.random() * 0.6, (Math.random() - 0.5) * 1.6)
      smoke.visible = false
      scene.add(smoke)
      smokeParticles.push(smoke)
    }

    let velocity = 0
    let altitudeValue = 0
    let flightTimeValue = 0
    let lastTime = performance.now()
    let frame = 0
    let animationId = 0
    let avoided = 0
    let dangerStartedAt = Number.POSITIVE_INFINITY
    const targetScaleVector = new THREE.Vector3(1, 1, 1)

    const showPlanetStory = (planet: PlanetInfo) => {
      if (storyOpenRef.current) return
      velocity = Math.max(velocity * 0.35, 4)
      boostRef.current = false
      storyOpenRef.current = true
      setPlanetStory(planet)
      setHint(`Ты встретил планету ${planet.name}. Прочитай рассказ и продолжай полёт`)
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('heavy')
    }

    const animate = (now: number) => {
      const delta = Math.min((now - lastTime) / 1000, 0.033)
      lastTime = now
      frame += delta

      const paused = storyOpenRef.current || shopOpenRef.current
      const active = !paused && (phaseRef.current === 'flying' || phaseRef.current === 'space' || phaseRef.current === 'danger')
      const dangerMode = !paused && phaseRef.current === 'danger'
      const boost = boostRef.current || phaseRef.current === 'space' || dangerMode
      const altitudeY = -0.35 + altitudeValue * 0.18

      if (active) {
        const currentUpgrades = upgradesRef.current
        const engineBonus = 1 + currentUpgrades.engine * 0.09
        const maneuverBonus = 1 + currentUpgrades.maneuver * 0.12
        const acceleration = (boost ? (dangerMode ? 4.6 : 7.4) : 2.3) * engineBonus
        const maxVelocity = (dangerMode ? 24 : 18) * (1 + currentUpgrades.engine * 0.07)
        velocity = clamp(velocity + acceleration * delta, 0, maxVelocity)
        altitudeValue += velocity * delta
        flightTimeValue += delta

        const targetScale = altitudeValue >= 100 ? 0.52 : 1
        targetScaleVector.set(targetScale, targetScale, targetScale)
        rocket.scale.lerp(targetScaleVector, 0.055)
        const visibleHalfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * camera.position.z
        const visibleHalfWidth = visibleHalfHeight * camera.aspect
        const xBound = Math.max(0.9, Math.min(dangerMode ? PLAYER_BOUNDS.xSpace : PLAYER_BOUNDS.xGround, visibleHalfWidth - 0.72 * targetScale))
        const yBound = Math.max(0.85, Math.min(dangerMode ? PLAYER_BOUNDS.ySpace : PLAYER_BOUNDS.yGround, visibleHalfHeight - 1.45 * targetScale))
        const zBound = (dangerMode ? PLAYER_BOUNDS.zSpace : PLAYER_BOUNDS.zGround) * (1 + currentUpgrades.maneuver * 0.04)
        const keyboard = keyboardRef.current
        const keyboardActive = keyboard.x !== 0 || keyboard.y !== 0
        const offset = playerOffsetRef.current

        if (keyboardActive) {
          const keyboardSpeed = (dangerMode ? 4.9 : 3.35) * maneuverBonus
          const verticalKeyboardSpeed = (dangerMode ? 4.25 : 3.05) * maneuverBonus
          offset.x = clamp(offset.x + keyboard.x * keyboardSpeed * delta, -xBound, xBound)
          offset.y = clamp(offset.y + keyboard.y * verticalKeyboardSpeed * delta, -yBound, yBound)
          offset.z = clamp(-offset.y * 0.2, -zBound, zBound)
          steerRef.current = { x: offset.x / xBound, y: -offset.y / yBound }
        } else {
          const targetX = steerRef.current.x * xBound
          const targetY = -steerRef.current.y * yBound
          const targetZ = clamp(-targetY * 0.2, -zBound, zBound)
          offset.x += (targetX - offset.x) * (dangerMode ? 0.28 : 0.18)
          offset.y += (targetY - offset.y) * (dangerMode ? 0.28 : 0.18)
          offset.z += (targetZ - offset.z) * (dangerMode ? 0.28 : 0.18)
        }

        offset.x = clamp(offset.x, -xBound, xBound)
        offset.y = clamp(offset.y, -yBound, yBound)
        offset.z = clamp(offset.z, -zBound, zBound)
        const normalizedX = xBound === 0 ? 0 : offset.x / xBound
        const normalizedY = yBound === 0 ? 0 : offset.y / yBound
        rocket.position.x = offset.x
        rocket.position.y = altitudeY + offset.y
        rocket.position.z = offset.z
        rocket.rotation.z = -normalizedX * (dangerMode ? 0.65 : 0.42) * maneuverBonus
        rocket.rotation.x = normalizedY * (dangerMode ? 0.42 : 0.22) * (1 + currentUpgrades.maneuver * 0.08)

        camera.position.y += (altitudeY + 2.2 + offset.y * 0.16 - camera.position.y) * 0.035
        camera.position.x += (rocket.position.x * 0.35 - camera.position.x) * 0.04
        camera.lookAt(rocket.position.x * 0.4, altitudeY + 0.25 + offset.y * 0.12, 0)

        if (altitudeValue > 95 && phaseRef.current === 'flying') {
          setGamePhase('space')
          setHint('Орбита близко! На 1000 км ракета уменьшится — готовься к кометам')
          window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('medium')
        }

        if (altitudeValue >= 100 && phaseRef.current !== 'danger') {
          setGamePhase('danger')
          dangerStartedAt = frame
          setHint('1000 км! Ракета стала меньше. Облетай кометы и настоящие планеты')
          window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('heavy')
          obstacles.forEach((obstacle, index) => {
            obstacle.group.visible = true
            placeObstacle(obstacle, altitudeY, index)
          })
        }
      } else if (phaseRef.current === 'crashed') {
        rocket.rotation.z += delta * 1.6
        rocket.rotation.x += delta * 1.1
        if (flame) flame.visible = false
      } else {
        rocket.rotation.y += delta * 0.35
        if (flame) {
          flame.scale.y = 0.38 + Math.sin(frame * 9) * 0.08
        }
      }

      if (dangerMode) {
        obstacles.forEach((obstacle) => {
          obstacle.group.position.y -= (1.6 + velocity * 0.11) * delta
          obstacle.group.position.x += Math.sin(frame * 1.5 + obstacle.spin) * obstacle.drift * delta
          obstacle.group.rotation.x += delta * obstacle.spin
          obstacle.group.rotation.y += delta * obstacle.spin * 0.75

          const passedRocket = obstacle.group.position.y < altitudeY - 4
          if (passedRocket) {
            avoided += 1
            setDangerScore(avoided)
            if (obstacle.kind === 'comet') {
              setCoins((current) => current + 1)
              setHint('Чистый пролёт мимо кометы: +1 монета')
            }
            placeObstacle(obstacle, altitudeY + 6, Math.random() * 8)
          }

          const distance = obstacle.group.position.distanceTo(rocket.position)
          const graceOver = frame - dangerStartedAt > 5
          if (graceOver && distance < obstacle.radius + 0.34) {
            if (obstacle.kind === 'planet' && obstacle.planet) {
              showPlanetStory(obstacle.planet)
              avoided += 1
              setDangerScore(avoided)
              placeObstacle(obstacle, altitudeY + 9, Math.random() * 8)
            } else {
              if (shieldChargeRef.current > 0) {
                shieldChargeRef.current -= 1
                setShieldCharge(shieldChargeRef.current)
                setHint('Щит принял удар кометы')
                window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('medium')
              } else {
                setGamePhase('crashed')
                boostRef.current = false
                setHint('Комета сбила ракету. Улучши щит или манёвренность в магазине')
                window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('heavy')
              }
              placeObstacle(obstacle, altitudeY + 7, Math.random() * 8)
            }
          }
        })
      }

      const flamePower = active ? (boost ? 1.35 : 0.85) : 0.45
      if (flame && phaseRef.current !== 'crashed') {
        flame.scale.setScalar(1)
        flame.scale.y = flamePower + Math.sin(frame * 22) * 0.15
        flame.visible = active || Math.sin(frame * 4) > 0
      }
      engineLight.position.copy(rocket.position).add(new THREE.Vector3(0, -2.2 * rocket.scale.y, 0))
      engineLight.intensity = active ? 3.5 + Math.sin(frame * 18) : 1.2

      smokeParticles.forEach((smoke, index) => {
        smoke.visible = active && altitudeValue < 45
        if (smoke.visible) {
          smoke.position.y -= delta * (0.3 + index * 0.01)
          smoke.scale.multiplyScalar(1 + delta * 0.4)
          ;(smoke.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 0.24 - altitudeValue / 160)
          if (smoke.position.y < -4.2) {
            smoke.position.set((Math.random() - 0.5) * 1.9, rocket.position.y - 2.2, (Math.random() - 0.5) * 1.9)
            smoke.scale.setScalar(1)
          }
        }
      })

      nearStars.rotation.y += delta * (dangerMode ? 0.048 : 0.014)
      midStars.rotation.y -= delta * (dangerMode ? 0.022 : 0.007)
      farStars.rotation.y += delta * 0.004
      const sceneryY = -0.35 + altitudeValue * 0.18
      nebulaA.position.y = sceneryY + 15 + Math.sin(frame * 0.14) * 1.6
      nebulaB.position.y = sceneryY + 39 + Math.cos(frame * 0.11) * 1.8
      nebulaA.material.opacity = altitudeValue > 55 ? 0.42 : 0.18
      nebulaB.material.opacity = altitudeValue > 85 ? 0.38 : 0.12
      distantPlanets.forEach((planet, index) => {
        planet.rotation.y += delta * (0.05 + index * 0.025)
        if (planet.position.y < sceneryY - 18) {
          planet.position.y = sceneryY + 62 + index * 24
          planet.position.x = (index % 2 === 0 ? -1 : 1) * (7 + Math.random() * 6)
        }
      })
      cometStreaks.forEach((streak, index) => {
        streak.position.x += delta * (0.8 + index * 0.18)
        streak.position.y -= delta * (1.9 + index * 0.28)
        if (streak.position.y < sceneryY - 16 || streak.position.x > 15) {
          streak.position.set(-14 - Math.random() * 8, sceneryY + 42 + Math.random() * 52, -13 - Math.random() * 13)
        }
      })
      earth.rotation.y += delta * 0.035
      pad.visible = altitudeValue < 28
      earth.position.y = -7 - altitudeValue * 0.045
      scene.background = new THREE.Color(altitudeValue >= 100 ? '#12051f' : altitudeValue > 80 ? '#020617' : '#071133')

      if (Math.floor(frame * 10) % 2 === 0) {
        setAltitude(Math.floor(altitudeValue * 10))
        setSpeed(Math.floor(velocity * 42))
        setScore(Math.floor(altitudeValue * 15 + flightTimeValue * 8 + avoided * 25))
      }

      renderer.render(scene, camera)
      animationId = requestAnimationFrame(animate)
    }

    animationId = requestAnimationFrame(animate)

    const resize = () => {
      if (!mount) return
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  const start = () => {
    boostRef.current = true
    playerOffsetRef.current = { x: 0, y: 0, z: 0 }
    steerRef.current = { x: 0, y: 0 }
    shieldChargeRef.current = upgradesRef.current.shield > 0 ? 1 : 0
    setShieldCharge(shieldChargeRef.current)
    setGamePhase('flying')
    setHint('Держи ускорение и веди ракету по экрану пальцем или WASD/стрелками')
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('medium')
  }

  const continueFlight = () => {
    storyOpenRef.current = false
    setPlanetStory(null)
    boostRef.current = true
    setHint('Рассказ прочитан — продолжаем полёт! Облетай следующие планеты и кометы')
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('medium')
  }

  const reset = () => {
    window.location.reload()
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2
    steerRef.current = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }
  }

  return (
    <main className="game-shell">
      <div className="scene" ref={mountRef} onPointerMove={handlePointerMove} onPointerDown={handlePointerMove} />

      <section className="hud top">
        <div>
          <p className="eyebrow">Telegram 3D Mini Game</p>
          <h1>3D Ракета</h1>
        </div>
        <div className={`status ${phase}`}>
          {phase === 'ready' && 'На старте'}
          {phase === 'flying' && 'Взлёт'}
          {phase === 'space' && 'Космос'}
          {phase === 'danger' && 'Опасная зона'}
          {phase === 'crashed' && 'Авария'}
        </div>
      </section>

      <section className="hud meters">
        <div className="meter">
          <span>Очки</span>
          <strong>{score}</strong>
        </div>
        <div className="meter">
          <span>Монеты</span>
          <strong>{coins}</strong>
        </div>
        <div className="meter">
          <span>Высота</span>
          <strong>{altitude} км</strong>
        </div>
        <div className="meter">
          <span>{phase === 'danger' || phase === 'crashed' ? 'Уклонения' : 'Скорость'}</span>
          <strong>{phase === 'danger' || phase === 'crashed' ? dangerScore : `${speed} км/ч`}</strong>
        </div>
      </section>

      <section className="hud keyboard-help" aria-label="Подсказка управления с клавиатуры">
        <span>Клавиатура: WASD/стрелки двигают по экрану</span>
      </section>

      {phase === 'danger' && (
        <section className="danger-banner">
          <ShieldAlert size={17} />
          <span>Кометы и планеты впереди</span>
          <strong>Щит: {shieldCharge}</strong>
        </section>
      )}


      {shopOpen && (
        <section className="planet-modal shop-modal" role="dialog" aria-label="Магазин улучшений ракеты">
          <div className="planet-card shop-card">
            <div className="planet-card-title shop-title">
              <Wrench size={22} />
              <span>Улучшения ракеты</span>
              <button className="icon-close" onClick={closeShop} aria-label="Закрыть магазин">
                <X size={18} />
              </button>
            </div>
            <div className="shop-balance">
              <Coins size={18} />
              <strong>{coins}</strong>
            </div>
            <div className="upgrade-list">
              {UPGRADE_LIST.map((upgrade) => {
                const Icon = upgrade.icon
                const level = upgrades[upgrade.key]
                const maxed = level >= MAX_UPGRADE_LEVEL
                const cost = getUpgradeCost(upgrade, level)
                const disabled = maxed || coins < cost

                return (
                  <article className="upgrade-item" key={upgrade.key}>
                    <div className="upgrade-icon">
                      <Icon size={20} />
                    </div>
                    <div className="upgrade-copy">
                      <div>
                        <strong>{upgrade.title}</strong>
                        <span>Ур. {level}/{MAX_UPGRADE_LEVEL}</span>
                      </div>
                      <p>{upgrade.description}</p>
                    </div>
                    <button className="upgrade-buy" onClick={() => buyUpgrade(upgrade)} disabled={disabled}>
                      {maxed ? 'MAX' : `${cost}`}
                    </button>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {planetStory && (
        <section className="planet-modal" role="dialog" aria-label={`Рассказ о планете ${planetStory.name}`}>
          <div className="planet-card">
            <div className="planet-card-title">
              <Globe2 size={22} />
              <span>Планета: {planetStory.name}</span>
            </div>
            <p>{planetStory.story}</p>
            <button className="planet-card-button" onClick={continueFlight}>Продолжить полёт</button>
          </div>
        </section>
      )}

      <section className="hud bottom">
        <p>{hint}</p>
        <div className="controls">
          <button className="secondary" onClick={reset} aria-label="Начать заново">
            <RotateCcw size={18} />
          </button>
          <button className="secondary" onClick={openShop} aria-label="Магазин улучшений">
            <Store size={18} />
          </button>
          <button
            className="boost"
            onPointerDown={() => {
              if (phase === 'ready') start()
              if (phase !== 'crashed') boostRef.current = true
            }}
            onPointerUp={() => {
              boostRef.current = phase === 'space' || phase === 'danger'
            }}
            onPointerLeave={() => {
              boostRef.current = phase === 'space' || phase === 'danger'
            }}
            disabled={phase === 'crashed'}
          >
            {phase === 'ready' ? <Rocket size={22} /> : <Zap size={22} />}
            {phase === 'ready' ? 'СТАРТ' : phase === 'crashed' ? 'СБИТО' : 'УСКОРЕНИЕ'}
          </button>
        </div>
      </section>
    </main>
  )
}
