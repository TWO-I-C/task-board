import assert from 'node:assert/strict'
import { createInterface } from 'node:readline'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'

const root = fileURLToPath(new URL('..', import.meta.url))
const bin = process.env.POSTGRES_BIN ?? '/Applications/Postgres.app/Contents/Versions/latest/bin'
const require = createRequire(join(root, 'package.json'))
const { Client } = require('pg')
const run = promisify(execFile)
const fixture = await mkdtemp(join(tmpdir(), 'task-board-permissions-check-'))
const probe = createServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const pgPort = probe.address().port
await new Promise(resolve => probe.close(resolve))
const dataDir = join(fixture, 'data')
const env = {...process.env, PGHOST:'127.0.0.1', PGPORT:String(pgPort), PGUSER:'task_board_test', PGDATABASE:'postgres', PORT:'0', APP_ORIGINS:'http://127.0.0.1:5174', COOKIE_SECURE:'false'}
let backend, preview, pgRunning = false, cleaning = false
let logs = ''
async function pgStart() {
  await run(join(bin,'pg_ctl'), ['-D',dataDir,'-l',join(fixture,'postgres.log'),'-w','start','-o',`-h 127.0.0.1 -p ${pgPort} -k ''`])
  pgRunning = true
}
async function pgStop() {
  if (pgRunning) {await run(join(bin,'pg_ctl'), ['-D',dataDir,'-w','stop','-m','fast']); pgRunning = false}
}
async function startBackend() {
  backend = spawn(process.execPath,['server/index.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']})
  backend.stderr.on('data',chunk=>{logs += chunk.toString()})
  return new Promise((resolve,reject) => {
    const timer=setTimeout(()=>reject(new Error('Backend startup timed out')),5000)
    backend.stdout.on('data',chunk=>{logs += chunk.toString();const match=chunk.toString().match(/http:\/\/127\.0\.0\.1:(\d+)\/api\/health/); if(match){clearTimeout(timer);resolve(`http://127.0.0.1:${match[1]}`)}})
    backend.once('error',error=>{clearTimeout(timer);reject(error)})
    backend.once('exit',code=>{clearTimeout(timer);reject(new Error(`Backend exited ${code}`))})
  })
}
async function stopBackend() {
  if(backend && backend.exitCode===null){const exited=once(backend,'exit');backend.kill('SIGTERM');await exited}
}
async function cleanup() {
  if(cleaning)return
  cleaning=true
  await preview?.close()
  await stopBackend()
  await pgStop()
  await rm(fixture,{recursive:true,force:true})
}
process.on('SIGINT',()=>cleanup().then(()=>process.exit(0)))
process.on('SIGTERM',()=>cleanup().then(()=>process.exit(0)))
const sql=async(text,values)=>{
  const client=new Client({host:'127.0.0.1',port:pgPort,user:'task_board_test',database:'postgres'})
  await client.connect()
  try{return (await client.query(text,values)).rows}finally{await client.end()}
}
try {
  await run(join(bin,'initdb'),['-D',dataDir,'-U','task_board_test','--auth=trust','--encoding=UTF8','--locale=C'])
  await pgStart()
  await run(process.execPath,['server/init-db.js'],{cwd:root,env})
  await run(process.execPath,['server/migrate-db.js'],{cwd:root,env})
  await sql("INSERT INTO tasks(id,title,completed) VALUES('legacy-task','旧的未分配任务',true)")
  let base=await startBackend()
  const password=randomUUID()+' 中文 '
  const api=(path,method='GET',body,cookie,extra={})=>fetch(base+path,{
    method, headers:{'X-Task-Board-Request':'1',Origin:'http://127.0.0.1:5174',
      ...(body!==undefined?{'Content-Type':'application/json'}:{}), ...(cookie?{Cookie:cookie}:{}),...extra},
    ...(body!==undefined?{body:JSON.stringify(body)}:{}), signal:AbortSignal.timeout(10000),
  })
  const register=async username=>{const response=await api('/api/register','POST',{username,password});assert.equal(response.status,201);return (await response.json()).user}
  const alice=await register('permission_alice'),bob=await register('permission_bob')
  const login=async username=>{
    const response=await api('/api/login','POST',{username,password});assert.equal(response.status,200)
    return response.headers.get('set-cookie').split(';')[0]
  }
  const aliceCookie=await login(alice.username),bobCookie=await login(bob.username)
  const taskRoutes=[['/api/tasks','GET',undefined],['/api/tasks','POST',{title:'不应新增'}],
    ['/api/tasks/legacy-task','PATCH',{completed:false}],['/api/tasks/legacy-task','PATCH',{title:'不应修改'}],['/api/tasks/legacy-task','DELETE',undefined]]
  for(const [path,method,body] of taskRoutes) {
    for(const cookie of [undefined,'task_board_session=invalid']) assert.equal((await api(path,method,body,cookie)).status,401)
  }
  console.log('PASS 1：未登录或伪造会话不能读取、新增、改名、改状态或删除任务（401）。')
  const create=async cookie=>{const response=await api('/api/tasks','POST',{title:'同名任务'},cookie);assert.equal(response.status,201);return (await response.json()).task}
  const a=await create(aliceCookie),b=await create(bobCookie)
  assert.notEqual(a.id,b.id)
  assert.equal((await sql('SELECT owner_id FROM tasks WHERE id=$1',[a.id]))[0].owner_id,alice.id)
  assert.equal((await sql('SELECT owner_id FROM tasks WHERE id=$1',[b.id]))[0].owner_id,bob.id)
  for(const [cookie,task,other] of [[aliceCookie,a,bob],[bobCookie,b,alice]]) {
    const response=await api('/api/tasks?owner_id='+other.id,'GET',undefined,cookie,{'X-User-Id':other.id})
    assert.equal(response.status,200);assert.deepEqual((await response.json()).tasks,[task])
    assert.equal(response.headers.get('cache-control'),'no-store')
  }
  console.log('PASS 2：两个账户的同名任务分别归属自己；列表不泄露对方及未分配任务，伪造查询参数无效。')
  const before=await sql('SELECT * FROM tasks ORDER BY id')
  for(const [cookie,target] of [[aliceCookie,b],[bobCookie,a],[aliceCookie,{id:'legacy-task'}],[bobCookie,{id:'missing-task'}]]) {
    for(const [method,body] of [['PATCH',{title:'越权改名'}],['PATCH',{completed:true}],['DELETE',undefined]]) {
      const response=await api('/api/tasks/'+target.id,method,body,cookie)
      assert.equal(response.status,404)
      assert.deepEqual(await response.json(),{error:'任务不存在或无权访问，请重新读取后端任务。'})
    }
  }
  for(const body of [{title:'伪造归属',owner_id:bob.id},{title:'伪造身份',user_id:bob.id},{title:'伪造初始状态',completed:true}]) {
    assert.equal((await api('/api/tasks','POST',body,aliceCookie)).status,400)
  }
  assert.equal((await api('/api/tasks/'+a.id,'PATCH',{owner_id:bob.id},aliceCookie)).status,400)
  assert.equal((await api('/api/tasks','POST',{title:'旧页面'},aliceCookie,{'X-Task-Board-User':bob.id})).status,409)
  for(const [path,method,body] of taskRoutes.filter(([,method])=>method!=='GET')) {
    assert.equal((await api(path,method,body,aliceCookie,{Origin:'https://outside.invalid'})).status,403)
    assert.equal((await api(path,method,body,aliceCookie,{'X-Task-Board-Request':''})).status,403)
  }
  assert.deepEqual(await sql('SELECT * FROM tasks ORDER BY id'),before)
  console.log('PASS 3：直接请求他人的任务 ID 仍被拒绝（404）；伪造归属、旧页面身份、跨站请求均不能改动数据库。')
  let response=await api('/api/tasks/'+a.id,'PATCH',{completed:true},aliceCookie)
  assert.equal(response.status,200);assert.equal((await response.json()).task.completed,true)
  response=await api('/api/tasks/'+a.id,'PATCH',{title:'自己的新名称'},aliceCookie)
  assert.equal(response.status,200);assert.equal((await response.json()).task.title,'自己的新名称')
  assert.equal((await sql('SELECT owner_id FROM tasks WHERE id=$1',[a.id]))[0].owner_id,alice.id)
  await stopBackend();base=await startBackend()
  response=await api('/api/tasks','GET',undefined,aliceCookie)
  assert.equal(response.status,200);assert.equal((await response.json()).tasks[0].title,'自己的新名称')
  assert.equal((await api('/api/tasks/'+a.id,'DELETE',undefined,aliceCookie)).status,200)
  assert.deepEqual((await (await api('/api/tasks','GET',undefined,aliceCookie)).json()).tasks,[])
  assert.deepEqual((await (await api('/api/tasks','GET',undefined,bobCookie)).json()).tasks,[b])
  console.log('PASS 4：自己的任务可新增、修改及删除，后端重启保留；其他用户的同名任务不受影响。')
  const beforeOutage=await sql('SELECT * FROM tasks ORDER BY id')
  await pgStop()
  for(const [path,method,body] of taskRoutes) {
    const response=await api(path,method,body,bobCookie)
    assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null)
  }
  await pgStart()
  assert.deepEqual(await sql('SELECT * FROM tasks ORDER BY id'),beforeOutage)
  assert.equal((await api('/api/tasks','GET',undefined,bobCookie)).status,200)
  assert.equal((await api('/api/logout','POST',{},aliceCookie)).status,200)
  for(const [path,method,body] of taskRoutes) assert.equal((await api(path,method,body,aliceCookie)).status,401)
  const digest=createHash('sha256').update(bobCookie.split('=')[1]).digest('hex')
  await sql("UPDATE sessions SET created_at=CURRENT_TIMESTAMP-INTERVAL '2 hours',expires_at=CURRENT_TIMESTAMP-INTERVAL '1 hour' WHERE token_hash=$1",[digest])
  for(const [path,method,body] of taskRoutes) assert.equal((await api(path,method,body,bobCookie)).status,401)
  assert.deepEqual(await sql('SELECT * FROM tasks ORDER BY id'),beforeOutage)
  assert.equal((await api('/api/health')).status,200)
  assert.ok(!logs.includes(password))
  console.log('PASS 5：数据库故障时拒绝操作（503），恢复后数据保留；已退出或过期的会话不能再操作任务（401）。')
  console.log('五组权限检查通过。测试仅使用临时数据库，没有连接你的 task_board 数据库。')
  if (!process.argv.includes('--browser')) { await cleanup() }
  else {
    const {createServer:createVite}=await import(pathToFileURL(require.resolve('vite')))
    preview=await createVite({root,configFile:join(root,'vite.config.js'),server:{host:'127.0.0.1',port:5174,strictPort:true,proxy:{'/api':base}}})
    await preview.listen()
    console.log('ISOLATED_BROWSER_PREVIEW=http://127.0.0.1:5174/')
    const input=createInterface({input:process.stdin});let chain=Promise.resolve()
    input.on('close',()=>{chain=chain.then(cleanup)})
    input.on('line',line=>{chain=chain.then(async()=>{
      if(line==='stop-db'){await pgStop();console.log('FIXTURE_DB_STOPPED')}
      if(line==='start-db'){await pgStart();console.log('FIXTURE_DB_STARTED')}
      if(line==='state')console.log(JSON.stringify(await sql('SELECT title,completed,username FROM tasks LEFT JOIN users ON users.id=tasks.owner_id ORDER BY title')))
      if(line==='expire'){await sql("UPDATE sessions SET created_at=CURRENT_TIMESTAMP-INTERVAL '2 hours',expires_at=CURRENT_TIMESTAMP-INTERVAL '1 hour'");console.log('FIXTURE_SESSIONS_EXPIRED')}
      if(line==='quit'){input.close();await cleanup();process.exit(0)}
    }).catch(async()=>{console.error('浏览器测试控制失败');await cleanup();process.exit(1)})})
  }
} catch(error) {
  console.error('权限检查失败：',error.code ?? error.name, error.message)
  await cleanup();process.exitCode=1
}
