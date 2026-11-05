import { randomUUID } from 'node:crypto'
import { test, expect } from './fixtures.js'

// 每个测试使用新账号；密码是临时生成的测试数据，不使用真实账号。
function newAccount() {
  return { username: `e2e_${randomUUID().replaceAll('-', '').slice(0, 16)}`, password: `fixture-${randomUUID()}` }
}

const taskBoard = page => page.getByRole('region', { name: '我的任务', exact: true })
const tasksNamed = (page, title) => taskBoard(page).getByRole('checkbox', { name: `任务：${title}`, exact: true })

async function register(page, account) {
  await page.goto('/')
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  await page.getByLabel('用户名', { exact: true }).fill(account.username)
  await page.getByLabel('密码', { exact: true }).fill(account.password)
  await page.getByLabel('再次输入密码', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: '注册账号', exact: true }).click()
  await expect(page.getByText('注册成功，请输入密码登录。', { exact: true })).toBeVisible()
  await expect(page.getByLabel('登录用户名', { exact: true })).toHaveValue(account.username)
  await expect(page.getByLabel('登录密码', { exact: true })).toHaveValue('')
  await expect(taskBoard(page)).toBeHidden()
}

async function login(page, account) {
  await page.getByLabel('登录用户名', { exact: true }).fill(account.username)
  await page.getByLabel('登录密码', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: account.username, exact: true })).toBeVisible()
  await expect(taskBoard(page).getByText('任务已加载。', { exact: true })).toBeVisible()
}

async function startAccount(page) {
  const account = newAccount()
  await register(page, account)
  await login(page, account)
  return account
}

async function addTask(page, title) {
  const board = taskBoard(page)
  await board.getByLabel('任务名称', { exact: true }).fill(title)
  await board.getByRole('button', { name: '新增任务', exact: true }).click()
  await expect(board.getByText('任务已新增。', { exact: true })).toBeVisible()
}

async function expectCounts(page, total, completed) {
  await expect(taskBoard(page).getByText(new RegExp(`^共\\s*${total}\\s*项\\s*·\\s*已完成\\s*${completed}\\s*项$`))).toBeVisible()
}

test('注册、错误密码、登录与退出', async ({ page }) => {
  const account = newAccount()
  await register(page, account)
  await page.getByLabel('登录密码', { exact: true }).fill('这是故意输入的错误密码')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('用户名或密码不正确')
  await expect(taskBoard(page)).toBeHidden()

  await login(page, account)
  await expect(taskBoard(page).getByText('还没有任务', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: account.username, exact: true })).toBeVisible()
  await expectCounts(page, 0, 0)

  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  await expect(taskBoard(page)).toBeHidden()
  await page.reload()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  await expect(taskBoard(page)).toBeHidden()
})

test('同名任务：取消不删除，确认只删除一条', async ({ page }) => {
  await startAccount(page)
  await addTask(page, '同名任务')
  await addTask(page, '同名任务')
  const matchingTasks = tasksNamed(page, '同名任务')
  await expect(matchingTasks).toHaveCount(2)
  // 页面在后端保存后才更新受控复选框，用异步断言等待最终状态。
  await matchingTasks.first().click()
  await expect(matchingTasks.first()).toBeChecked()
  await expectCounts(page, 2, 1)

  let deleteRequests = 0
  page.on('request', request => { if (request.method() === 'DELETE') deleteRequests += 1 })
  const deleteButtons = taskBoard(page).getByRole('button', { name: '删除任务“同名任务”', exact: true })
  await deleteButtons.first().click()
  await page.getByRole('button', { name: '取消删除', exact: true }).click()
  await expect(matchingTasks).toHaveCount(2)
  expect(deleteRequests).toBe(0)

  await deleteButtons.first().click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(taskBoard(page).getByText('任务已删除。', { exact: true })).toBeVisible()
  // 失败实验：临时把下一行的 1 改成 2；观察失败后还原为 1。
  await expect(matchingTasks).toHaveCount(1)
  await expectCounts(page, 1, 0)
  await expect(matchingTasks).not.toBeChecked()
  expect(deleteRequests).toBe(1)
  await page.reload()
  await expect(tasksNamed(page, '同名任务')).toHaveCount(1)
  await expectCounts(page, 1, 0)
})

test('编辑、筛选与刷新保留', async ({ page }) => {
  await startAccount(page)
  await addTask(page, '读书')
  await addTask(page, '跑步')
  await tasksNamed(page, '读书').click()
  await expect(tasksNamed(page, '读书')).toBeChecked()
  await expectCounts(page, 2, 1)
  const board = taskBoard(page)
  await board.getByRole('button', { name: '未完成', exact: true }).click()
  await expect(tasksNamed(page, '读书')).toHaveCount(0)
  await expect(tasksNamed(page, '跑步')).toHaveCount(1)
  await expectCounts(page, 2, 1)

  await board.getByRole('button', { name: '已完成', exact: true }).click()
  await board.getByRole('button', { name: '编辑任务“读书”', exact: true }).click()
  await page.getByLabel('修改任务名称', { exact: true }).fill('   ')
  await page.getByRole('button', { name: '保存名称', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('不能只输入空格')
  await expect(tasksNamed(page, '读书')).toBeChecked()
  await page.getByLabel('修改任务名称', { exact: true }).fill('读书 30 分钟')
  await page.getByRole('button', { name: '保存名称', exact: true }).click()
  await expect(tasksNamed(page, '读书 30 分钟')).toBeChecked()
  await expectCounts(page, 2, 1)
  await page.reload()
  await expect(tasksNamed(page, '读书 30 分钟')).toBeChecked()
  await expect(tasksNamed(page, '跑步')).not.toBeChecked()
  await expectCounts(page, 2, 1)
})

test('不同账号隔离，同一浏览器的标签页同步退出', async ({ page, browser, testApp }) => {
  const alice = await startAccount(page)
  await addTask(page, 'A 的私有任务')
  const bobContext = await browser.newContext({ baseURL: testApp.url })
  try {
    const bobPage = await bobContext.newPage()
    const bob = await startAccount(bobPage)
    await expectCounts(bobPage, 0, 0)
    await expect(tasksNamed(bobPage, 'A 的私有任务')).toHaveCount(0)
    await addTask(bobPage, 'B 的私有任务')

    await page.reload()
    await expect(page.getByRole('heading', { name: alice.username, exact: true })).toBeVisible()
    await expect(tasksNamed(page, 'A 的私有任务')).toHaveCount(1)
    await expect(tasksNamed(page, 'B 的私有任务')).toHaveCount(0)

    // 同一 context 的标签页共享 Cookie；新的 context 才是独立登录环境。
    const secondAliceTab = await page.context().newPage()
    await secondAliceTab.goto('/')
    await expect(secondAliceTab.getByRole('heading', { name: alice.username, exact: true })).toBeVisible()
    await page.getByLabel('任务名称', { exact: true }).fill('不应遗留的草稿')
    await secondAliceTab.getByRole('button', { name: '退出登录', exact: true }).click()
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
    await expect(taskBoard(page)).toBeHidden()
    await login(page, alice)
    await expect(page.getByLabel('任务名称', { exact: true })).toHaveValue('')
    await expect(tasksNamed(page, 'A 的私有任务')).toHaveCount(1)

    await bobPage.reload()
    await expect(bobPage.getByRole('heading', { name: bob.username, exact: true })).toBeVisible()
    await expect(tasksNamed(bobPage, 'B 的私有任务')).toHaveCount(1)
    await expect(tasksNamed(bobPage, 'A 的私有任务')).toHaveCount(0)
  } finally { await bobContext.close() }
})

test('响应丢失后先核对，读取失败不伪装成空列表', async ({ page }) => {
  await startAccount(page)
  await addTask(page, '原来的任务')
  const board = taskBoard(page)
  let savedStatus
  const loseCreateResponse = async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return }
    // 真正发送给测试后端并写入临时数据库，但不把响应交给页面。
    const response = await route.fetch({ maxRetries: 0 })
    savedStatus = response.status()
    await route.abort('failed')
  }
  await page.route('**/api/tasks', loseCreateResponse)
  await board.getByLabel('任务名称', { exact: true }).fill('已保存但响应丢失')
  await board.getByRole('button', { name: '新增任务', exact: true }).click()
  await expect(board.getByRole('alert')).toContainText('本次新增结果未确认')
  expect(savedStatus).toBe(201)
  await expect(board.getByLabel('任务名称', { exact: true })).toHaveValue('已保存但响应丢失')
  await expect(board.getByRole('button', { name: '新增任务', exact: true })).toBeDisabled()

  await page.unroute('**/api/tasks', loseCreateResponse)
  await board.getByRole('button', { name: '刷新任务', exact: true }).click()
  await expect(tasksNamed(page, '已保存但响应丢失')).toHaveCount(1)
  await expectCounts(page, 2, 0)
  // 已核对到成功保存，清空草稿，不重复新增。
  await board.getByLabel('任务名称', { exact: true }).fill('')

  const failRead = route => route.abort('failed')
  await page.route('**/api/tasks', failRead)
  await board.getByRole('button', { name: '刷新任务', exact: true }).click()
  await expect(board.getByRole('alert')).toContainText('无法连接服务')
  await expect(board.getByText('还没有任务', { exact: true })).toBeHidden()
  await expect(board.getByRole('button', { name: '新增任务', exact: true })).toBeDisabled()
  await page.unroute('**/api/tasks', failRead)
  await page.reload()
  await expect(tasksNamed(page, '已保存但响应丢失')).toHaveCount(1)
  await expectCounts(page, 2, 0)
})
