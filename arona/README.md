# 阿罗娜的小窝 · 陪伴助理

蓝白色的小房间里，有个想和你说说话的小伙伴。换身衣服、吃份点心，或者把今天的小事写进本本。

[返回项目首页](../README.md) · [看看爱蜜莉雅版](../emilia/README.md) · [部署说明](DEPLOYMENT.md)

![阿罗娜的小窝首页](../docs/images/arona-room.jpg)

## 摸摸头，再陪她玩一会儿

房间里可以聊天、摸头、吃点心、猜拳、拆小纸条，也可以安静陪伴。互动会有对白、表情或动作反馈；好感度用于解锁游戏内容。

已有互动台词提供中日双语预设配音，换装也有各自的台词。待机约 25–35 秒后会随机轻哼，播放前可能需要一次页面点击。

## 打开衣柜

日常、JK、洛丽塔、水手服、泳装、运动服和婚纱，每套都有自己的风格。换装之后可以继续眨眼、招手、吃布丁和猜拳。

![阿罗娜衣柜](../docs/images/arona-wardrobe.jpg)

<table>
<tr><th>放学一起走</th><th>兔兔茶会</th><th>晴空来信</th></tr>
<tr>
<td align="center"><img src="dist/assets/wardrobe/jk-v1.png" width="220" alt="JK 立绘"></td>
<td align="center"><img src="dist/assets/wardrobe/lolita-v1.png" width="220" alt="洛丽塔立绘"></td>
<td align="center"><img src="dist/assets/wardrobe/sailor-v1.png" width="220" alt="水手服立绘"></td>
</tr>
</table>

## 一起出去玩

从小窝去樱花公园、云朵甜品店或晴空海边，背景和音乐会跟着切换，选好的衣服会保留。回房间之后，还可以切换午后、雨天和星空。

![穿着洛丽塔来到云朵甜品店](../docs/images/arona-cafe.jpg)

## 记住那些容易忘的小事

小本本支持记事、待办和旧聊天关键词查询，可以修改、删除或标记完成。接入模型后，也可以在聊天中明确要求保存与查询，页面会展示实际执行回执。

![小本本中的演示记录](../docs/images/arona-notebook.jpg)

截图中的记录为虚构演示。这里不会发送定时提醒或关闭网页后的通知；角色只知道你告诉她、并实际保存过的内容。

## 本地运行

Node.js 24+，无需安装第三方依赖。在仓库根目录运行：

```sh
npm run start:arona
```

打开 http://127.0.0.1:4173/#room 。也可进入 `arona/` 后执行 `node --env-file-if-exists=.env server.mjs`。

无 Key 可体验预设互动、已有配音、衣柜、场景和手动小本本。自由聊天、语音识别与实时配音需要阿里云百炼 Key；复制 `.env.example` 为 `.env` 后填写。现成音色与原角色声优并不相同。

实际 `.env`、`deploy.env` 与 `data/` 不提交。公开部署、数据保存和口令配置请看 [DEPLOYMENT.md](DEPLOYMENT.md)。未支持的能力按约定显示：“当前功能暂不适用，去找直觉哥哥加一下吧”。

## 开发与素材

- 测试：仓库根目录运行 `npm run test:arona`。
- [历史实现与验证记录](DEVELOPMENT-HISTORY.md)：保留原有开发记录，历史验收不代表新环境已通过。
- [公开发布说明](PUBLICATION.md)：源码、隐私配置与素材边界。
- 角色、配音、背景和音乐来源见 `dist/assets/**/sources.json`。代码 MIT 不覆盖原作角色和第三方素材权利。
