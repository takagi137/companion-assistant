# 爱蜜莉雅的小窝 · 陪伴助理

从宅邸的午后，到雪林里的散步。一个温柔的小伙伴，也帮你记住“东西放在哪里了”。

[返回项目首页](../README.md) · [看看阿罗娜版](../arona/README.md) · [部署说明](DEPLOYMENT.md)

![爱蜜莉雅宅邸小窝首页](../docs/images/emilia-room.jpg)

## 银发精灵的衣柜

白紫日常服、JK、洛丽塔、水手服、清凉泳装、运动服、婚纱共七套 Q 版换装；每套都有眨眼、招手、吃点心、猜拳和休息动作。

![爱蜜莉雅的七套换装](../docs/images/emilia-wardrobe.jpg)

<table>
<tr><th>日常 · 银发精灵</th><th>洛丽塔 · 紫罗兰茶会</th><th>水手服 · 晴空来信</th></tr>
<tr>
<td align="center"><img src="dist/assets/emilia-preview/original-v1.svg" width="220" alt="日常 Q 版立绘"></td>
<td align="center"><img src="dist/assets/emilia-preview/lolita-v1.svg" width="220" alt="洛丽塔 Q 版立绘"></td>
<td align="center"><img src="dist/assets/emilia-preview/sailor-v1.svg" width="220" alt="水手服 Q 版立绘"></td>
</tr>
</table>

## 去熟悉的异世界走走

宅邸小窝、艾利欧尔森林、王都街道和水门都市，搭配不同的纯音乐。服装会随出游保留，回来之后还能听雨、看星空。

![爱蜜莉雅穿着洛丽塔来到艾利欧尔森林](../docs/images/emilia-forest.jpg)

场景是参考《Re:从零开始的异世界生活》的 AI 同人演绎，不是官方截图或精确复刻。BGM 采用有来源与署名的纯音乐，详见 `dist/assets/scene-bgm/licensed/sources.json`。

## “钥匙放哪了？”

先告诉她：“钥匙放在玄关第二个抽屉。”以后问“钥匙在哪”，会回答最后记录的位置和时间。

![查询钥匙最后记录的位置](../docs/images/emilia-find-item.jpg)

点击回执可以查看位置历史。下次挪了地方，再告诉她新位置；小本本也支持手动记录、别名搜索与备注。

![物品位置历史](../docs/images/emilia-item-history.jpg)

以上截图均为临时演示记录。明确的常用记录、查询句式无需模型 Key；其他表达可用手动表单或接入模型后处理。这里只报告用户记录，不追踪现实位置，也不主动发定时通知。

## 温柔的声音与日常互动

摸头、点心、猜拳、换装与切景有预设配音；待机约 25–35 秒后随机播放轻哼。当前预设使用阿里云 Nini（邻家妹妹）合成，并非原作声优的声音。

中文聊天可以搭配日语朗读，静态互动音频可重复播放。自由聊天、语音识别和新台词的实时合成需要用户自行配置阿里云百炼。

## 本地运行

需要 Node.js 24+，无第三方运行依赖。在仓库根目录执行：

```sh
npm run start:emilia
```

打开 http://127.0.0.1:4174/#room 。也可进入 `emilia/` 后执行 `node --env-file-if-exists=.env server.mjs`。

复制 `.env.example` 为 `.env` 后按需填 Key、口令和模型配置。无 Key 可先体验预设互动、衣柜、已有音频、小本本以及常用物品记录和查询。

本版默认数据库为 `data/emilia.sqlite`，与阿罗娜版分别保存 Cookie、配置和数据。不要把 `SORA_DATABASE_PATH` 指向另一版本的数据库；真实配置与聊天记录不提交。公开部署见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 开发与素材

- 测试：仓库根目录运行 `npm run test:emilia`。
- [素材来源清单](ASSET-SOURCES.json) · [发布说明](PUBLICATION.md)。
- [历史实现与验证记录](DEVELOPMENT-HISTORY.md)：保留历史证据，浏览器截图不等于实体手机验收。
- 原创代码使用 MIT；角色、音乐和其他素材按各自来源与授权处理。本项目为爱好者作品，与原作官方无关联。
