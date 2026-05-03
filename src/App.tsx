import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Globe2, RotateCcw, Rocket, ShieldAlert, Zap } from 'lucide-react'
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

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

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

  const bodyMat = new THREE.MeshStandardMaterial({ color: '#f7fafc', metalness: 0.45, roughness: 0.28 })
  const redMat = new THREE.MeshStandardMaterial({ color: '#ef4444', metalness: 0.25, roughness: 0.32 })
  const blueMat = new THREE.MeshStandardMaterial({ color: '#60a5fa', emissive: '#1d4ed8', emissiveIntensity: 0.35 })
  const darkMat = new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.5, roughness: 0.35 })
  const flameMat = new THREE.MeshStandardMaterial({ color: '#f97316', emissive: '#fb923c', emissiveIntensity: 1.8, transparent: true, opacity: 0.92 })

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 2.8, 48), bodyMat)
  body.position.y = 0
  rocket.add(body)

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.9, 48), redMat)
  nose.position.y = 1.85
  rocket.add(nose)

  const windowFrame = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 16, 48), darkMat)
  windowFrame.position.set(0, 0.75, 0.47)
  rocket.add(windowFrame)

  const windowGlass = new THREE.Mesh(new THREE.CircleGeometry(0.18, 48), blueMat)
  windowGlass.position.set(0, 0.75, 0.522)
  rocket.add(windowGlass)

  const finShape = new THREE.Shape()
  finShape.moveTo(0, 0)
  finShape.lineTo(0.7, -0.9)
  finShape.lineTo(0.16, -0.72)
  finShape.lineTo(0, 0)
  const finGeom = new THREE.ExtrudeGeometry(finShape, { depth: 0.08, bevelEnabled: false })

  for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    const fin = new THREE.Mesh(finGeom, redMat)
    fin.position.y = -1.0
    fin.rotation.y = angle
    fin.position.x = Math.sin(angle) * 0.42
    fin.position.z = Math.cos(angle) * 0.42
    rocket.add(fin)
  }

  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.32, 36), darkMat)
  engine.position.y = -1.55
  rocket.add(engine)

  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.25, 36), flameMat)
  flame.name = 'flame'
  flame.position.y = -2.25
  flame.rotation.x = Math.PI
  rocket.add(flame)

  return rocket
}

function createStars(count = 900) {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 70
    positions[i * 3 + 1] = Math.random() * 120 - 20
    positions[i * 3 + 2] = (Math.random() - 0.5) * 70
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({ color: '#e0f2fe', size: 0.06, transparent: true, opacity: 0.9 })
  return new THREE.Points(geometry, material)
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
  const phaseRef = useRef<GamePhase>('ready')
  const storyOpenRef = useRef(false)
  const [phase, setPhase] = useState<GamePhase>('ready')
  const [altitude, setAltitude] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [dangerScore, setDangerScore] = useState(0)
  const [planetStory, setPlanetStory] = useState<PlanetInfo | null>(null)
  const [hint, setHint] = useState('Нажми СТАРТ и удерживай ускорение')

  const setGamePhase = (next: GamePhase) => {
    phaseRef.current = next
    setPhase(next)
  }

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    tg?.ready?.()
    tg?.expand?.()
  }, [])

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

    const ambient = new THREE.AmbientLight('#93c5fd', 0.75)
    scene.add(ambient)
    const sun = new THREE.DirectionalLight('#ffffff', 2.4)
    sun.position.set(6, 8, 6)
    scene.add(sun)
    const engineLight = new THREE.PointLight('#fb923c', 3, 8)
    scene.add(engineLight)

    const stars = createStars()
    scene.add(stars)

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
    rocket.position.y = -0.75
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
    let lastTime = performance.now()
    let frame = 0
    let animationId = 0
    let avoided = 0
    let dangerStartedAt = Number.POSITIVE_INFINITY

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

      const storyPaused = storyOpenRef.current
      const active = !storyPaused && (phaseRef.current === 'flying' || phaseRef.current === 'space' || phaseRef.current === 'danger')
      const dangerMode = !storyPaused && phaseRef.current === 'danger'
      const boost = boostRef.current || phaseRef.current === 'space' || dangerMode

      if (active) {
        const acceleration = boost ? (dangerMode ? 4.6 : 7.4) : 2.3
        velocity = clamp(velocity + acceleration * delta, 0, dangerMode ? 24 : 18)
        altitudeValue += velocity * delta

        const targetScale = altitudeValue >= 100 ? 0.52 : 1
        rocket.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.055)
        rocket.position.y = -0.75 + altitudeValue * 0.18
        rocket.position.x = steerRef.current.x * (dangerMode ? 2.75 : 1.8)
        rocket.position.z = steerRef.current.y * (dangerMode ? 1.35 : 0.35)
        rocket.rotation.z = -steerRef.current.x * (dangerMode ? 0.55 : 0.35)
        rocket.rotation.x = steerRef.current.y * (dangerMode ? 0.34 : 0.18)

        camera.position.y += ((rocket.position.y + 2.2) - camera.position.y) * 0.035
        camera.position.x += (rocket.position.x * 0.35 - camera.position.x) * 0.04
        camera.lookAt(rocket.position.x * 0.4, rocket.position.y + 0.25, 0)

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
            placeObstacle(obstacle, rocket.position.y, index)
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

          const passedRocket = obstacle.group.position.y < rocket.position.y - 4
          if (passedRocket) {
            avoided += 1
            setDangerScore(avoided)
            placeObstacle(obstacle, rocket.position.y + 6, Math.random() * 8)
          }

          const distance = obstacle.group.position.distanceTo(rocket.position)
          const graceOver = frame - dangerStartedAt > 5
          if (graceOver && distance < obstacle.radius + 0.34) {
            if (obstacle.kind === 'planet' && obstacle.planet) {
              showPlanetStory(obstacle.planet)
              avoided += 1
              setDangerScore(avoided)
              placeObstacle(obstacle, rocket.position.y + 9, Math.random() * 8)
            } else {
              setHint('Комета задела ракету — держись дальше от хвоста!')
              window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light')
              placeObstacle(obstacle, rocket.position.y + 7, Math.random() * 8)
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

      stars.rotation.y += delta * (dangerMode ? 0.04 : 0.012)
      earth.rotation.y += delta * 0.035
      pad.visible = altitudeValue < 28
      earth.position.y = -7 - altitudeValue * 0.045
      scene.background = new THREE.Color(altitudeValue >= 100 ? '#12051f' : altitudeValue > 80 ? '#020617' : '#071133')

      if (Math.floor(frame * 10) % 2 === 0) {
        setAltitude(Math.floor(altitudeValue * 10))
        setSpeed(Math.floor(velocity * 42))
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
    setGamePhase('flying')
    setHint('Держи ускорение и веди пальцем, чтобы стабилизировать полёт')
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
          <span>Высота</span>
          <strong>{altitude} км</strong>
        </div>
        <div className="meter">
          <span>{phase === 'danger' || phase === 'crashed' ? 'Уклонения' : 'Скорость'}</span>
          <strong>{phase === 'danger' || phase === 'crashed' ? dangerScore : `${speed} км/ч`}</strong>
        </div>
      </section>

      {phase === 'danger' && (
        <section className="danger-banner">
          <ShieldAlert size={17} /> Кометы и планеты впереди — веди ракету пальцем
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
