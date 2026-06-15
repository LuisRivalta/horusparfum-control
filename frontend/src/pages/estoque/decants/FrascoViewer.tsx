import { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface FrascoViewerProps {
  percentual: number   // 0 to 1
  size?: 'sm' | 'lg'
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
    const maxH = 2.8 // max liquid height (bottle interior)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100)
    camera.position.set(1.8, 1.0, 5.5)
    camera.lookAt(0, 0, 0)

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

    // Bottle body
    scene.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 3.0, 32), glassMat))

    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.82, 0.9, 32), glassMat)
    neck.position.y = 1.95
    scene.add(neck)

    // Gold cap
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.2, 32),
      new THREE.MeshStandardMaterial({ color: 0xc9a84c, roughness: 0.2, metalness: 0.8 })
    )
    cap.position.y = 2.5
    scene.add(cap)

    // Liquid — full-height cylinder, repositioned via scale to animate level
    const liquidMat = new THREE.MeshStandardMaterial({
      color: 0xc9a84c,
      transparent: true,
      opacity: 0.78,
      emissive: 0xc9a84c,
      emissiveIntensity: 0.07,
    })
    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.92, maxH, 32), liquidMat)
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
