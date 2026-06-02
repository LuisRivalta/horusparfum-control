import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

interface ModelViewerProps {
  modelUrl?: string
  className?: string
  style?: React.CSSProperties
  autoRotate?: boolean
  autoRotateSpeed?: number
}

export function ModelViewer({
  modelUrl,
  className = '',
  style,
  autoRotate = true,
  autoRotateSpeed = 2,
}: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current!
    const width = container.clientWidth || 1
    const height = container.clientHeight || 1

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.set(0, 1.2, 3.5)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.enablePan = false
    controls.minDistance = 2
    controls.maxDistance = 8
    controls.autoRotate = autoRotate
    controls.autoRotateSpeed = autoRotateSpeed
    controls.target.set(0, 0.5, 0)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.8)
    dirLight.position.set(3, 5, 4)
    scene.add(dirLight)

    const rimLight = new THREE.DirectionalLight(0xc9a84c, 1)
    rimLight.position.set(-3, 2, -2)
    scene.add(rimLight)

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6)
    fillLight.position.set(0, -2, 3)
    scene.add(fillLight)

    const pmremGenerator = new THREE.PMREMGenerator(renderer)
    const envScene = new THREE.Scene()
    envScene.background = new THREE.Color(0x333333)
    const envTexture = pmremGenerator.fromScene(envScene).texture
    scene.environment = envTexture
    pmremGenerator.dispose()

    if (modelUrl) {
      const loader = new GLTFLoader()
      loader.load(modelUrl, (gltf) => {
        const model = gltf.scene
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        model.position.sub(center)
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        model.scale.setScalar(2 / maxDim)
        model.position.y += 0.5
        scene.add(model)
      })
    } else {
      const sphereGeo = new THREE.SphereGeometry(0.7, 64, 64)
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0xc9a84c,
        metalness: 0.9,
        roughness: 0.15,
      })
      const sphere = new THREE.Mesh(sphereGeo, sphereMat)
      sphere.position.y = 1
      scene.add(sphere)

      const baseGeo = new THREE.CylinderGeometry(1, 1.1, 0.15, 64)
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a18,
        metalness: 0.5,
        roughness: 0.3,
      })
      const base = new THREE.Mesh(baseGeo, baseMat)
      base.position.y = 0.075
      scene.add(base)

      const ringGeo = new THREE.TorusGeometry(1.05, 0.02, 16, 64)
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xc9a84c,
        metalness: 1,
        roughness: 0.1,
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.15
      scene.add(ring)
    }

    const handleResize = () => {
      const w = container.clientWidth || 1
      const h = container.clientHeight || 1
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }

    const ro = new ResizeObserver(handleResize)
    ro.observe(container)

    let rafId: number
    const animate = () => {
      rafId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [modelUrl, autoRotate, autoRotateSpeed])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', cursor: 'grab', ...style }}
    />
  )
}
