import { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface FrascoViewerProps {
  percentual: number   // 0 to 1
  size?: 'sm' | 'lg'
}

// Seção transversal: retângulo de cantos arredondados (footprint do flask).
function roundedRectShape(w: number, d: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -d / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + d - r)
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d)
  s.lineTo(x + r, y + d)
  s.quadraticCurveTo(x, y + d, x, y + d - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

// Prisma vertical centrado na origem, extrudado a partir de uma rounded-rect.
// bevel > 0 arredonda as bordas de topo/base (ombros do flask).
function verticalPrism(shape: THREE.Shape, height: number, bevel: number) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 16,
    steps: 1,
  })
  geo.center()
  geo.rotateX(-Math.PI / 2) // eixo de extrusão (Z) → vertical (Y)
  return geo
}

export function FrascoViewer({ percentual, size = 'sm' }: FrascoViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  // Ref for animation target — updated without recreating the scene
  const targetRef = useRef(percentual)

  // Update target when prop changes (without recreating the scene)
  useEffect(() => {
    targetRef.current = percentual
  }, [percentual])

  // Create/recreate the Three.js scene only when `size` changes
  useEffect(() => {
    if (!mountRef.current) return

    const w = size === 'sm' ? 80 : 140
    const h = size === 'sm' ? 100 : 200
    const maxH = 2.75 // altura do líquido a 100% (interior do flask)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100)
    camera.position.set(1.3, 1.2, 6.6)
    camera.lookAt(0, 0.42, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    // Remove qualquer canvas órfão antes de anexar: o StrictMode (dev) e o HMR
    // re-executam este effect e podem deixar um canvas antigo empilhado (o "reflexo").
    mountRef.current.replaceChildren()
    mountRef.current.appendChild(renderer.domElement)

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dir = new THREE.DirectionalLight(0xfff5e0, 1.1)
    dir.position.set(3, 5, 3)
    scene.add(dir)
    const fill = new THREE.DirectionalLight(0xc9a84c, 0.25)
    fill.position.set(-3, 0, -3)
    scene.add(fill)

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xddd8c8,
      transparent: true,
      opacity: 0.2,
      roughness: 0.05,
      metalness: 0.05,
      side: THREE.DoubleSide,
      // Casca de vidro transparente NÃO escreve profundidade: senão oclui o líquido
      // que está atrás da parede frontal do vidro (o que sumia o dourado a 100%).
      depthWrite: false,
    })

    // Corpo — flask retangular de cantos arredondados (silhueta tipo LV Imagination)
    const body = new THREE.Mesh(verticalPrism(roundedRectShape(1.8, 1.05, 0.32), 2.7, 0.14), glassMat)
    scene.add(body)

    // Pescoço curto de vidro entre o corpo e a tampa
    const neck = new THREE.Mesh(verticalPrism(roundedRectShape(0.86, 0.62, 0.2), 0.18, 0.04), glassMat)
    neck.position.y = 1.62
    scene.add(neck)

    // Tampa robusta arredondada
    const cap = new THREE.Mesh(
      verticalPrism(roundedRectShape(1.5, 0.9, 0.28), 0.5, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xc9a84c, roughness: 0.25, metalness: 0.8 })
    )
    cap.position.y = 2.0
    scene.add(cap)

    // Líquido — prisma de altura máxima, reposicionado via escala para animar o nível
    const liquidMat = new THREE.MeshStandardMaterial({
      color: 0xc9a84c,
      transparent: true,
      opacity: 0.78,
      emissive: 0xc9a84c,
      emissiveIntensity: 0.07,
    })
    const liquid = new THREE.Mesh(verticalPrism(roundedRectShape(1.58, 0.84, 0.26), maxH, 0), liquidMat)
    scene.add(liquid)

    function applyPct(pct: number) {
      const p = Math.max(Math.min(pct, 1), 0.0001)
      liquid.scale.y = p
      liquid.position.y = -maxH / 2 + (maxH * p) / 2
    }

    let currPct = targetRef.current
    applyPct(currPct)

    let rafId: number
    const animate = () => {
      rafId = requestAnimationFrame(animate)
      const target = targetRef.current
      if (Math.abs(target - currPct) > 0.004) {
        currPct += (target - currPct) * 0.07
        applyPct(currPct)
      }
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(rafId)
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          ;(obj.material as THREE.Material).dispose()
        }
      })
      renderer.dispose()
      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement)
      }
    }
  }, [size])

  const w = size === 'sm' ? 80 : 140
  const h = size === 'sm' ? 100 : 200
  return <div ref={mountRef} style={{ width: w, height: h }} />
}
