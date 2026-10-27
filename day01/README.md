# Day1: STS で「自分は誰か」を確認する / S3 バケット名のルール

## 自分のまとめ

- AWS を操作するうえで、プロファイル（`~/.aws/credentials` / `~/.aws/config`）の設定まわりを学んだ
- STS の `get-caller-identity` で、**いまの認証情報で自分が誰として認証されているか**を確認できる
- これは「あなたは誰か」（**認証**）の話。「何をしてよいか」（**認可**）は、リクエストのたびに AWS がポリシー（IAM ポリシーやバケットポリシー）と照らし合わせて判断する
- ARN は特定のリソースを指す識別子

## 実行したコマンドと出力

```bash
aws sts get-caller-identity --profile localstack
```

```json
{
    "UserId": "AKIAIOSFODNN7EXAMPLE",
    "Account": "000000000000",
    "Arn": "arn:aws:iam::000000000000:root"
}
```

| 項目 | 意味 |
| --- | --- |
| `Account` | AWS アカウント ID（12桁） |
| `Arn` | 呼び出し元（caller）の ARN。ここではアカウント `000000000000` のルートユーザー |
| `UserId` | 呼び出し元の一意な識別子。**ただの名札で、これだけではリクエストできない** |

- 本人であることの証明には、アクセスキー ID とシークレットアクセスキーを使う。シークレットキーそのものは送られず、リクエストへの署名（Signature Version 4）に使われる
- `UserId` は本番と LocalStack で違う
  - 本番 AWS: root ならアカウント ID、IAM ユーザーなら `AIDA...`、ロールなら `AROA...:セッション名`
  - LocalStack: アクセスキーがそのまま出た

## ARN の形

```
arn:partition:service:region:account-id:resource
arn:aws:iam::000000000000:root
```

- IAM はグローバルなサービスなので `region` が空
- S3 バケットの ARN（`arn:aws:s3:::my-bucket`）は `region` も `account-id` も空。バケット名は**全リージョン・全アカウントで一意**なので、名前だけで特定できるから
- ARN は「どれか」を示すだけで、「誰が使えるか」（権限）は表さない

## S3 バケット名で試したこと

| 状況 | 結果 |
| --- | --- |
| us-east-1 で作成（`LocationConstraint` なし） | 成功 |
| ap-northeast-1 で `LocationConstraint` なし | `IllegalLocationConstraintException` |
| 同じアカウントで、別リージョンに同じ名前 | `BucketAlreadyOwnedByYou`（自分のアカウントがもう持っている） |
| 別アカウントで同じ名前 | `BucketAlreadyExists`（他のアカウントが使っている） |

- `LocationConstraint` を書かないと、バケットは us-east-1 に作るものとして扱われる。ap-northeast-1 に送ったリクエストの中身が「us-east-1 に作って」になって食い違い、エラーになった

## つまずいたところ

1. **`--endpoint-url` なしで本番 AWS に送っていた**
   `localstack2` プロファイルに送り先の設定がなく、`InvalidAccessKeyId` になった。エラーの段階（認証で弾かれている）と「LocalStack はどんなキーでも受け付けるはず」から、送り先が違うと気づけた。プロファイルに `endpoint_url` を設定すれば毎回書かなくて済む
2. **別アカウントのつもりが同じアカウントだった**
   2つのプロファイルが同じアクセスキーだった。LocalStack では、アクセスキーを12桁の数字（例: `111111111111`）にするとそれがアカウント ID になる
3. **`'NoneType' is not a container or iterable`**
   `An error occurred (XXX)` の形ではなく、CLI（Python）自身のエラー。`--debug` で見ると、サーバーは `BucketAlreadyExists` を返していたが `<Message />` が空で、CLI が処理しきれなかったと考えられる（LocalStack と CLI の組み合わせの問題。本番では通常のエラー表示になる）

## LocalStack と本番 AWS の違いメモ

- アカウント ID はデフォルトで `000000000000`。アクセスキーが12桁の数字なら、それがアカウント ID になる
- デフォルトでは IAM ポリシーをチェックしないので、どのキーでも基本的に何でもできる。本番では認証と認可の両方が必ずチェックされる
- 本番では root のアクセスキーを作るのは非推奨。ふだんは IAM ユーザーやロールを使う

## 参考ドキュメント

- [AWS CLI: 設定ファイルと認証情報ファイル](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)
- [AWS CLI: エンドポイントの設定](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-endpoints.html)
- [AWS CLI: aws configure set](https://docs.aws.amazon.com/cli/latest/reference/configure/set.html)
- [IAM: Amazon Resource Names (ARNs)](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference-arns.html)
- [IAM: 一意の識別子](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html)
- [IAM: ルートユーザー](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html)
- [STS: GetCallerIdentity](https://docs.aws.amazon.com/STS/latest/APIReference/API_GetCallerIdentity.html)
- [S3: CreateBucket](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateBucket.html)
- [S3: バケットの命名規則](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html)
