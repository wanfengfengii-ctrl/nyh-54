import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  MachineConfig,
  OrderInfo,
  MultiMachineSimulationResult
} from '../types'
import {
  DEFAULT_PARAMS,
  DEFAULT_ENV_PARAMS,
  MACHINE_COLORS,
  DEFAULT_MACHINE_CONFIG
} from '../types/constants'
import {
  runMultiMachineSimulation,
  exportMultiMachineReport
} from '../utils/simulation'
import {
  generateMachineId,
  generateOrderId
} from '../utils/idGenerator'
import {
  machinePersistence,
  orderPersistence,
  multiMachinePersistence
} from '../utils/persistence'

export const useMultiMachineStore = defineStore('multiMachine', () => {
  const machines = ref<MachineConfig[]>([])
  const orders = ref<OrderInfo[]>([])
  const multiMachineResults = ref<MultiMachineSimulationResult[]>([])
  const activeMultiSimId = ref<string | null>(null)
  const multiSimBatchesPerMachine = ref(5)
  const multiSimRunning = ref(false)

  const activeMultiSimResult = computed<MultiMachineSimulationResult | null>(() => {
    if (!activeMultiSimId.value) return null
    return multiMachineResults.value.find(r => r.id === activeMultiSimId.value) ?? null
  })

  function addMachine(name?: string, customParams?: Partial<MachineConfig>): MachineConfig {
    const id = generateMachineId()
    const index = machines.value.length
    const color = MACHINE_COLORS[index % MACHINE_COLORS.length]
    const machine: MachineConfig = {
      id,
      name: name || `机台 ${index + 1}`,
      params: customParams?.params ? { ...customParams.params } : { ...DEFAULT_PARAMS },
      envParams: customParams?.envParams ? { ...customParams.envParams } : { ...DEFAULT_ENV_PARAMS },
      status: customParams?.status ?? 'idle',
      capacity: customParams?.capacity ?? DEFAULT_MACHINE_CONFIG.capacity,
      allocatedCapacity: customParams?.allocatedCapacity ?? 0,
      rollerWear: customParams?.rollerWear ?? 0,
      totalRunCount: customParams?.totalRunCount ?? 0,
      lastMaintenanceTime: Date.now(),
      createdAt: Date.now(),
      color
    }
    machines.value.push(machine)
    persistMachines()
    return machine
  }

  function updateMachine(machineId: string, updates: Partial<MachineConfig>) {
    const idx = machines.value.findIndex(m => m.id === machineId)
    if (idx >= 0) {
      machines.value[idx] = { ...machines.value[idx], ...updates }
      persistMachines()
    }
  }

  function deleteMachine(machineId: string) {
    machines.value = machines.value.filter(m => m.id !== machineId)
    orders.value.forEach(o => {
      o.assignedMachines = o.assignedMachines.filter(id => id !== machineId)
    })
    persistMachines()
    persistOrders()
  }

  function addOrder(order: Omit<OrderInfo, 'id'>): OrderInfo {
    const id = generateOrderId()
    const newOrder: OrderInfo = {
      ...order,
      id
    }
    orders.value.push(newOrder)
    persistOrders()
    return newOrder
  }

  function updateOrder(orderId: string, updates: Partial<OrderInfo>) {
    const idx = orders.value.findIndex(o => o.id === orderId)
    if (idx >= 0) {
      orders.value[idx] = { ...orders.value[idx], ...updates }
      persistOrders()
    }
  }

  function deleteOrder(orderId: string) {
    orders.value = orders.value.filter(o => o.id !== orderId)
    persistOrders()
  }

  async function startMultiMachineSimulation(): Promise<MultiMachineSimulationResult | null> {
    if (machines.value.length === 0) return null
    multiSimRunning.value = true
    try {
      await new Promise(resolve => setTimeout(resolve, 50))
      const result = runMultiMachineSimulation(
        machines.value,
        orders.value,
        multiSimBatchesPerMachine.value
      )
      multiMachineResults.value.push(result)
      activeMultiSimId.value = result.id
      persistMultiMachineResults()
      return result
    } catch (e) {
      console.error('Multi-machine simulation failed:', e)
      return null
    } finally {
      multiSimRunning.value = false
    }
  }

  function setActiveMultiSimResult(resultId: string | null) {
    activeMultiSimId.value = resultId
  }

  function deleteMultiSimResult(resultId: string) {
    multiMachineResults.value = multiMachineResults.value.filter(r => r.id !== resultId)
    if (activeMultiSimId.value === resultId) {
      activeMultiSimId.value = null
    }
    persistMultiMachineResults()
  }

  function downloadMultiMachineReport(result: MultiMachineSimulationResult) {
    const text = exportMultiMachineReport(result)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `多机台生产报告_${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function persistMachines() {
    machinePersistence.save(machines.value)
  }

  function persistOrders() {
    orderPersistence.save(orders.value)
  }

  function persistMultiMachineResults() {
    multiMachinePersistence.save(multiMachineResults.value)
  }

  function loadPersistedMachines() {
    const loaded = machinePersistence.load()
    if (loaded) {
      machines.value = loaded
    }
  }

  function loadPersistedOrders() {
    const loaded = orderPersistence.load()
    if (loaded) {
      orders.value = loaded
    }
  }

  function loadPersistedMultiMachineResults() {
    const loaded = multiMachinePersistence.load()
    if (loaded) {
      multiMachineResults.value = loaded
    }
  }

  function initDemoData() {
    if (machines.value.length === 0) {
      addMachine('海德堡 SM-1', {
        params: { viscosity: 52, pressure: 55, rollingCount: 3, heightDiff: 12 },
        envParams: { temperature: 24, humidity: 48, rollerWear: 15, paperAbsorption: 52, printRunCount: 12500 },
        status: 'running',
        capacity: 100,
        allocatedCapacity: 0,
        rollerWear: 15,
        totalRunCount: 12500
      })
      addMachine('罗兰 R700', {
        params: { viscosity: 48, pressure: 48, rollingCount: 4, heightDiff: 8 },
        envParams: { temperature: 26, humidity: 55, rollerWear: 35, paperAbsorption: 48, printRunCount: 28600 },
        status: 'running',
        capacity: 80,
        allocatedCapacity: 0,
        rollerWear: 35,
        totalRunCount: 28600
      })
      addMachine('小森 L440', {
        params: { viscosity: 60, pressure: 62, rollingCount: 3, heightDiff: 18 },
        envParams: { temperature: 23, humidity: 42, rollerWear: 68, paperAbsorption: 60, printRunCount: 45200 },
        status: 'warning',
        capacity: 120,
        allocatedCapacity: 0,
        rollerWear: 68,
        totalRunCount: 45200
      })
      addMachine('秋山 BT40', {
        params: { viscosity: 45, pressure: 42, rollingCount: 5, heightDiff: 5 },
        envParams: { temperature: 25, humidity: 50, rollerWear: 8, paperAbsorption: 45, printRunCount: 8300 },
        status: 'idle',
        capacity: 90,
        allocatedCapacity: 0,
        rollerWear: 8,
        totalRunCount: 8300
      })
    }

    if (orders.value.length === 0) {
      const machineIds = machines.value.map(m => m.id)
      const now = Date.now()
      addOrder({
        name: '高档画册印刷',
        totalQuantity: 5000,
        completedQuantity: 1200,
        requiredCoverage: 65,
        requiredUniformity: 75,
        deadline: now + 5 * 24 * 3600000,
        priority: 'high',
        assignedMachines: machineIds.slice(0, 2),
        createdAt: now,
        status: 'in_progress'
      })
      addOrder({
        name: '精品包装盒',
        totalQuantity: 3000,
        completedQuantity: 800,
        requiredCoverage: 70,
        requiredUniformity: 80,
        deadline: now + 7 * 24 * 3600000,
        priority: 'medium',
        assignedMachines: machineIds.slice(1, 3),
        createdAt: now,
        status: 'in_progress'
      })
      addOrder({
        name: '艺术纸邀请函',
        totalQuantity: 2000,
        completedQuantity: 0,
        requiredCoverage: 60,
        requiredUniformity: 85,
        deadline: now + 10 * 24 * 3600000,
        priority: 'low',
        assignedMachines: machineIds.length > 3 ? [machineIds[3]] : [],
        createdAt: now,
        status: 'pending'
      })
    }
  }

  function init() {
    loadPersistedMachines()
    loadPersistedOrders()
    loadPersistedMultiMachineResults()
    initDemoData()
  }

  return {
    machines,
    orders,
    multiMachineResults,
    activeMultiSimId,
    activeMultiSimResult,
    multiSimBatchesPerMachine,
    multiSimRunning,
    addMachine,
    updateMachine,
    deleteMachine,
    addOrder,
    updateOrder,
    deleteOrder,
    startMultiMachineSimulation,
    setActiveMultiSimResult,
    deleteMultiSimResult,
    downloadMultiMachineReport,
    init
  }
})
