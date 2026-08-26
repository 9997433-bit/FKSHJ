# 疯狂水世界 / Crazy Water World — 游戏规格

## 1. 产品定位

浏览器端 **水上乐园滑道竞速 + 收集闯关** 街机游戏，灵感来自「疯狂水世界」：充气泳圈冲下滑道、水花飞溅、热带配色、轻松爽快。

- 单机、无需后端
- 桌面键盘 + 触屏滑动
- 一开即玩，单局 60–120 秒
- 中文 UI

## 2. 技术栈（强制对齐，禁止另起炉灶）

| 项 | 选择 |
| --- | --- |
| 语言 | TypeScript |
| 构建 | Vite |
| 渲染 | HTML5 Canvas 2D（伪 3D / 2.5D 透视滑道） |
| 音频 | Web Audio API（程序化合成，不依赖外部音频文件） |
| 测试 | Node.js 内置 `node --test` + `tsx` |
| 部署 | 静态站点（`dist/`） |

禁止引入 React/Vue/Three.js/物理引擎大库，除非规格修订。保持零后端、可离线。

## 3. 目录与模块契约

```
index.html
package.json
vite.config.ts
tsconfig.json
src/
  main.ts                 # 启动、场景切换
  game/engine.ts          # 场景栈、资源、尺寸
  game/loop.ts            # rAF 循环、dt clamp
  game/input.ts           # 键盘 / 触屏
  game/camera.ts          # 2.5D 投影
  game/physics.ts         # 速度、加速、摩擦力
  game/collision.ts       # 车道 AABB / 圆环碰撞
  entities/player.ts      # 泳圈玩家
  entities/collectible.ts # 金币 / 宝石
  entities/obstacle.ts    # 障碍
  entities/booster.ts     # 加速带
  world/track.ts          # 滑道网格、弯道、坡度
  world/levels.ts         # 主题段与生成器
  world/water.ts          # 水面波动
  fx/particles.ts         # 粒子
  fx/splash.ts            # 水花
  fx/audio.ts             # BGM / SFX
  ui/hud.ts               # 局内 HUD
  ui/menus.ts             # 标题 / 暂停 / 结算
  ui/theme.ts             # 色彩与皮肤
  data/constants.ts       # 数值表
  data/save.ts            # localStorage
  tests/*.test.ts
scripts/bench.ts
scripts/smoke.mjs
```

## 4. 核心玩法

### 4.1 控制

- `A` / `←` 向左换道；`D` / `→` 向右换道
- 触屏：左 / 中 / 右三分屏点按（左换道、中跳跃、右换道），或水平滑动
- `Space` / 上滑：小跳（越过矮障碍，消耗冷却）
- `P` / `Esc`：暂停
- 前进由滑道重力 + 水流自动驱动，玩家不控制油门

### 4.2 车道

- 默认 **5 车道**（-2 … +2）
- 换道有插值（120–180ms），换道中不可再换
- 撞墙（滑道边缘）掉速度并溅水，不直接死亡

### 4.3 实体

| 类型 | 效果 |
| --- | --- |
| 金币 Coin | +10 分，连击 +1 |
| 宝石 Gem | +50 分，连击 +3 |
| 加速带 Boost | 1.6× 速度，持续 1.2s |
| 充气障碍 Tube | 撞击：速度 ×0.45，连击清零，HP-1 |
| 漩涡 Vortex | 吸入相邻车道，减速 |
| 橡皮鸭 Duck | 可跳过；撞上同 Tube |
| 水环 Ring | 穿过 +100 分并短暂无敌闪光 |

### 4.4 生命与失败

- 3 点 HP（泳圈气量）
- HP=0 或 落水（偏离滑道过久）→ 结算
- 连续无伤 15 个实体可回 1 HP（上限 3）

### 4.5 计分

```
score = distance*0.2 + coins*10 + gems*50 + rings*100 + comboBonus
comboBonus = combo*(combo-1)*2
```

- 连击超时 1.8s
- 本地最高分写入 `localStorage` key: `cww_hiscore_v1`

## 5. 关卡主题段（单局流式拼接）

同一滑道按距离切换主题，每段约 400–600 世界单位：

1. **热带港** Tropical — 青绿水、棕榈、白天
2. **洞穴瀑** Cave — 幽蓝、萤光、收窄车道
3. **火山泉** Volcano — 橙红、蒸汽、更快流速
4. **霓虹夜** Neon — 品红/电青、障碍密度最高

生成器必须可复现：`seed = dateDay ^ runId`。

## 6. 视觉 SOTA 底线

- 60fps（1080p 桌面），粒子峰值 < 400
- 透视滑道：近大远小，消失点在画布上方 18%
- 水面：至少 2 层正弦叠加 + 泡沫带
- 玩家泳圈：高光、投影、入水涟漪
- 主题色必须走 `ui/theme.ts`，禁止模块内硬编码散落色值
- HUD 不遮挡滑道中线

## 7. 场景流

`boot → title → playing → paused → gameover → title`

- 标题：开始、操作说明、最高分
- 局内：分数 / 距离 / 连击 / HP / 主题名
- 结算：本局分、最远距离、金币、是否新纪录、再来一局

## 8. 验收清单（SOTA）

- [ ] `npm install && npm test` 全绿
- [ ] `npm run build` 成功
- [ ] 标题到再来一局闭环可玩
- [ ] 键盘与触屏都能换道
- [ ] 四主题至少各出现一次（足够长的一局）
- [ ] 碰撞、得分、连击、最高分正确
- [ ] 无外部网络资源（字体可用系统字体栈）
- [ ] 文档（README）含启动方式

## 9. 数值（`src/data/constants.ts` 为唯一来源）

见该文件。修改数值必须改 constants，禁止魔法数扩散。
