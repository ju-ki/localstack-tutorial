# Lambda "Docker not available" トラブルシューティング

## エラー内容

```
Error while creating lambda: Docker not available
```

## 環境

- macOS + Docker Desktop
- LocalStack 3.x (`docker compose` で起動)

---

## 調査の流れ

### 1. ソケットのマウントを確認

`docker inspect` でボリュームを確認したところ、`docker-compose.yml` に2行のソケットマウントが書かれていた：

```yaml
volumes:
  - "${HOME}/.docker/run/docker.sock:/var/run/docker.sock"
  - '/var/run/docker.sock:/var/run/docker.sock'
```

### 2. ホスト側のソケットの存在確認

```bash
ls -la ~/.docker/run/docker.sock
# → 存在する (macOS Docker Desktop のソケット)

ls -la /var/run/docker.sock
# → No such file or directory
```

**原因の一つ**: 2行目のホスト側パス `/var/run/docker.sock` が存在しないのにマウントしようとしており、1行目の正しいマウントを上書きしていた可能性がある。

### 3. コンテナ内からDockerへの接続テスト

```bash
docker exec localstack_demo ls -la /var/run/docker.sock
# → ソケットファイルは存在する

docker exec localstack_demo curl --unix-socket /var/run/docker.sock http://localhost/version
# → Failed to connect → ソケットはあるが通信できない
```

**原因の本質**: ファイルは存在するがDockerデーモンと通信できない状態だった。

### 4. Docker Desktop の設定確認

**Settings → Advanced → "Allow the default Docker socket to be used"** が **OFF** だった。

これを **ON** にすることで `/var/run/docker.sock` がホスト上にシンボリックリンクとして作成された：

```bash
ls -la /var/run/docker.sock
# lrwxr-xr-x  root  daemon  /var/run/docker.sock -> /Users/jukiya/.docker/run/docker.sock
```

---

## 解決策

### docker-compose.yml の volumes を修正

```yaml
volumes:
  - '/var/run/docker.sock:/var/run/docker.sock'
```

- `${HOME}/.docker/run/docker.sock` のマウントは削除
- Docker Desktop の "Allow the default Docker socket to be used" を ON にした上で `/var/run/docker.sock` を使う

### 再起動

```bash
docker compose down && docker compose up -d
```

---

## まとめ（根本原因）

1. macOS の Docker Desktop はデフォルトで `/var/run/docker.sock` を作らない
2. そのため LocalStack コンテナ内から Docker デーモンに通信できなかった
3. Docker Desktop の設定で default socket を有効にし、そのパスをマウントすることで解決

## 参考

- [LocalStack Lambda Docker not available](https://docs.localstack.cloud/user-guide/aws/lambda/#docker-not-available)
