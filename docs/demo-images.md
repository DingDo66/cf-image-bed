# 本地示例图片来源

`npm run demo:seed` 是可选的本地演示操作。它仅连接固定的 `http://127.0.0.1:8787`，从 Unsplash 的图片 CDN 下载下面 8 张示例照片，并通过本地真实上传 API 写入本地 D1 / R2。它不会连接生产图床，也不在构建或部署时自动执行。再次运行会跳过同名图片。

下列文件名、标签和描述是本项目用于演示的命名，不代表摄影作品的原始标题。来源链接与 `scripts/seed-demo.mjs` 的清单一致：

| 本地文件 | 图片来源 |
| --- | --- |
| `mountain.jpg` | [Unsplash · photo-1464822759023-fed622ff2c3b](https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1400&h=790&q=85&fm=jpg) |
| `sea.jpg` | [Unsplash · photo-1473116763249-2faaef81ccda](https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=1400&h=790&q=85&fm=jpg) |
| `architecture.jpg` | [Unsplash · photo-1600607687920-4e2a09cf159d](https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&h=790&q=85&fm=jpg) |
| `plant.jpg` | [Unsplash · photo-1501004318641-b39e6451bec6](https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1400&h=790&q=85&fm=jpg) |
| `dunes.jpg` | [Unsplash · photo-1509316785289-025f5b846b35](https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=1400&h=790&q=85&fm=jpg) |
| `clouds.jpg` | [Unsplash · photo-1534088568595-a066f410bcda](https://images.unsplash.com/photo-1534088568595-a066f410bcda?auto=format&fit=crop&w=1400&h=790&q=85&fm=jpg) |
| `interior.jpg` | [Unsplash · photo-1600210492486-724fe5c67fb0](https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&h=790&q=85&fm=jpg) |
| `lake.jpg` | [Unsplash · photo-1470770841072-f978cf4d019e](https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1400&h=790&q=85&fm=jpg) |

远程图片可能随时变更或不可用，下载失败不会影响正常图床功能。项目代码的 MIT 许可不授予对第三方照片的额外权利；对示例照片的进一步使用请查看 [Unsplash License](https://unsplash.com/license) 及 [使用条款](https://unsplash.com/terms)。部署后的图片库从空白开始，由部署者上传自己的内容。
