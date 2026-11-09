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

---

# 演習2: IAM — Lambda 用のロールを作る

## 自分のまとめ

- **信頼ポリシー**は「誰がこのロールを借りることができるか」、**権限ポリシー**は「このロールで、どのリソースに対して、どのアクションが許可されているか」を示す
- IAM ユーザーはパスワードやアクセスキーといった**長期の認証情報**を持つ。ロールは長期の認証情報を持たず、引き受けた（AssumeRole）ときに STS から**期限付きの認証情報**が発行される。一時的なのは「権限」ではなく「認証情報」
- ロールは「入館証」のようなもの。信頼ポリシー＝誰が入館証を借りられるか、権限ポリシー＝その入館証でどの部屋に入れるか

## 実行したコマンド

### 1. ロールを作り、信頼ポリシーを直す

```bash
# 作成（最初は信頼ポリシーが誤っていた）
aws iam create-role --role-name sample-role --assume-role-policy-document '{...}'

# 信頼ポリシーだけを差し替える
aws iam update-assume-role-policy --role-name sample-role --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
```

完成した信頼ポリシーは「**Lambda サービスが、このロールを引き受ける（sts:AssumeRole）ことを許可する**」という意味。

- Lambda 関数が動くとき、そこに人はいない。**Lambda サービス自身**がロールを引き受け、一時キーを関数の実行環境に渡す。だから関数のコードにアクセスキーを書かなくてよい
- Lambda はどのロールでも引き受けられるわけではない。信頼ポリシーに `lambda.amazonaws.com` があり、かつ関数作成時に `--role` で指定したロールだけ
- 引き受けてよいかを判断するのは Lambda ではなく、AWS（IAM / STS）側
- 信頼ポリシーに書けるのは「誰がロールになれるか」だけ。ロールになった後に何ができるかは、権限ポリシーで決まる

### 2. 権限ポリシー（インライン）を付ける

`policy/s3-sample-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SampleS3ListRole",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::s3-demo-bucket"
    },
    {
      "Sid": "SampleS3DetailRole",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::s3-demo-bucket/*"
    }
  ]
}
```

```bash
aws iam put-role-policy --role-name sample-role --policy-name s3-sample-policy-name --policy-document file://policy/s3-sample-policy.json
aws iam get-role-policy --role-name sample-role --policy-name s3-sample-policy-name
```

- 一覧（`s3:ListBucket`）は**バケットそのもの**の ARN、中身の取得（`s3:GetObject`）は**オブジェクト**の ARN（`バケット/*`）に対して許可する。だから Resource を分ける
- API 名と IAM のアクション名は一致しないことがある。一覧の API は `ListObjectsV2` だが、IAM のアクションは `s3:ListBucket`
- ファイルから渡すときは `file://` が必要。付けないと、ファイル名の文字列そのものが JSON として送られる

## つまずいたところ

1. **信頼ポリシーに権限ポリシーの中身を書いていた**
   `"Action": "lambda:*"` は「Lambda の操作を何でもしてよい」という権限の書き方。信頼ポリシーの Action は「ロールを引き受ける」= `sts:AssumeRole`
2. **Principal にアカウントの ARN を書いていた**
   `"AWS": "arn:aws:iam::000000000000:root"` は「そのアカウントの中の人が引き受けてよい」という意味で、人がロールを切り替えるときの形。サービスを指すときはキーが `"Service"` で、値は ARN ではなく `lambda.amazonaws.com` のような名前
3. **間違ったポリシーでもロールが作れてしまった**
   作成に成功しても、ポリシーが正しいとは限らない

## LocalStack と本番 AWS の違いメモ

- LocalStack は初期設定では、ポリシーの中身を**検証も強制もしない**。API の形が合っていれば受け付ける
- 本番では、たとえば `"Service"` にアカウントの ARN を書くと、作成時に `MalformedPolicyDocument`（Invalid principal）で弾かれる
- LocalStack でも `ENFORCE_IAM=1` を設定すると、権限チェックを有効にできる

## 参考ドキュメント

- [IAM ロール](https://docs.aws.amazon.com/ja_jp/IAM/latest/UserGuide/id_roles.html)
- [Lambda 実行ロール](https://docs.aws.amazon.com/ja_jp/lambda/latest/dg/lambda-intro-execution-role.html)
- [STS API リファレンス](https://docs.aws.amazon.com/STS/latest/APIReference/API_Operations.html)
- [Amazon S3 のアクション一覧](https://docs.aws.amazon.com/ja_jp/service-authorization/latest/reference/list_amazons3.html)
- [LocalStack: IAM Policy Enforcement](https://docs.localstack.cloud/user-guide/security-testing/iam-enforcement/)

---

# 演習3: S3 — バケット・オブジェクト・バージョニング

## 自分のまとめ

- S3 はクラウド上のオブジェクトストレージ。CLI には `aws s3`（高レベル）と `aws s3api`（API レベル）の2系統があり、より細かい操作ができるのが `s3api`。どちらも同じ S3 API を呼んでいる
- キーに `/` を含めるとフォルダのように見えるが、フォルダは実際には存在しない。一覧を取るときに S3 が `/` を区切り文字としてキーをまとめ、`CommonPrefixes` として返しているだけ
- バージョニングを有効にすると、一つのキー（オブジェクト）に対して複数の履歴（バージョン）を持てる

## aws s3 と aws s3api

| | `aws s3` | `aws s3api` |
| --- | --- | --- |
| 作り | 複数の API 呼び出しをまとめた便利コマンド | S3 の API 1つにコマンドが1つずつ対応 |
| 例 | `mb` / `cp` / `ls` / `rb` / `sync` | `create-bucket` / `put-object` / `list-objects-v2` / `put-bucket-versioning` |
| 得意なこと | 大きいファイルの自動マルチパート、`--recursive` でまとめて操作 | バケット設定の変更など、API の細かいパラメータを使う操作 |

- バケットの作成・削除はどちらでもできる。違いは「何ができるか」より「どういう単位で作られているか」
- バージョニングの設定はバケットの設定を変える API（`PutBucketVersioning`）なので、`aws s3` にはなく `s3api` を使う

## 実行したコマンド

### 1. バケットを作る

```bash
aws s3api create-bucket --bucket s3-demo-bucket --region ap-northeast-1 --create-bucket-configuration LocationConstraint=ap-northeast-1
aws s3 ls
```

- `--profile` を付けていないのは、`export AWS_PROFILE=localstack` を設定済みで、そのプロファイルに `endpoint_url = http://localhost:4566` があるから
- `AWS_PROFILE` が効くのはそのシェルの中だけ。新しいタブでは元に戻るので `echo $AWS_PROFILE` で確認する

### 2. notes/ 配下にアップロードして確認する

```bash
aws s3 cp notes/ s3://s3-demo-bucket/notes --recursive
aws s3 ls s3://s3-demo-bucket/notes --recursive
aws s3 cp s3://s3-demo-bucket/notes/test.json ./notes/test_copy.json
diff notes/test.json notes/test_copy.json   # 何も出なければ同じ
```

フォルダの正体を確かめる:

```bash
aws s3api list-objects-v2 --bucket s3-demo-bucket
aws s3api list-objects-v2 --bucket s3-demo-bucket --delimiter /
```

| | 区切り文字なし | `--delimiter /` |
| --- | --- | --- |
| `Contents` | `notes/test.json` と `test.json` の両方 | `test.json` だけ |
| `CommonPrefixes` | なし | `notes/` |

- オブジェクトのキー（名前）は `notes/test.json` という1本の文字列。`notes/` はその先頭部分（プレフィックス）で、オブジェクトではない
- `aws s3 ls` の `PRE notes/` という表示は、この `CommonPrefixes`
- 中身が同じ `notes/test.json` と `test.json` は ETag も同じだった。ETag はキーではなく中身から計算される（1回で送ったアップロードなら中身の MD5）ので、キーが違っても中身が同じなら同じ値になる

### 3. バージョニングを有効にして上書きする

```bash
aws s3api put-bucket-versioning --bucket s3-demo-bucket --versioning-configuration Status=Enabled
aws s3api get-bucket-versioning --bucket s3-demo-bucket   # "Status": "Enabled"

# 中身を変えて2回上書き
aws s3 cp ./notes/test.json s3://s3-demo-bucket/notes/test.json
aws s3 cp ./notes/test.json s3://s3-demo-bucket/notes/test.json

aws s3api list-object-versions --bucket s3-demo-bucket --prefix notes/
```

`notes/test.json` のバージョンが3つ:

| VersionId | IsLatest | 何か |
| --- | --- | --- |
| `U7_U45p...` | true | 2回目の上書き（最新） |
| `IGVzA5K...` | false | 1回目の上書き |
| `null` | false | バージョニングを有効にする前からあったもの |

- バージョニングを有効にする前から保存されていたオブジェクトは、`VersionId` が `null` になる
- `--prefix` を付けないと、ほかのキー（`test.json`）のバージョンも一覧に混ざる

## つまずいたところ

1. **バケット名のタイポ**
   `s3-demo--bucket`（ハイフン2つ）で作ってしまった。演習2の権限ポリシーは `s3-demo-bucket` を対象にしているので、名前が違うと権限が効かない。削除して作り直した
2. **`notes/` 配下ではなく直下にアップロードしていた**
   コピー先を `s3://s3-demo-bucket` にしていたため。`ls` の結果でキーを確認すれば気づける
3. **ダウンロード確認で直下の古いファイルを取っていた**
   `s3://s3-demo-bucket/test.json` を取っていた。不要なオブジェクトを先に消しておけば、エラーで気づける
4. **「プレフィックスを一つのオブジェクトとして扱っている」と考えていた**
   プレフィックスはオブジェクトではなく、キーの先頭部分。一覧のときにまとめて表示されるだけ

## LocalStack と本番 AWS の違いメモ

- LocalStack の `Location` は `http://<バケット名>.s3.localhost.localstack.cloud:4566/` になる。本番は `https://<バケット名>.s3.amazonaws.com/` などの形
- 本番のマネジメントコンソールで「フォルダを作成」すると、`notes/` という 0 バイトのオブジェクトが実際に作られる。フォルダに見えるものの正体は、これかプレフィックスのどちらか
- 本番では、us-east-1 以外のリージョンにバケットを作るとき `LocationConstraint` が必須

## 参考ドキュメント

- [AWS CLI: 高レベル (s3) コマンド](https://docs.aws.amazon.com/ja_jp/cli/latest/userguide/cli-services-s3-commands.html)
- [AWS CLI: API レベル (s3api) コマンド](https://docs.aws.amazon.com/ja_jp/cli/latest/userguide/cli-services-s3-apicommands.html)
- [S3: プレフィックスを使用したオブジェクトの整理](https://docs.aws.amazon.com/ja_jp/AmazonS3/latest/userguide/using-prefixes.html)
- [S3: ListObjectsV2](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html)
- [S3: バージョニング](https://docs.aws.amazon.com/ja_jp/AmazonS3/latest/userguide/Versioning.html)
- [S3: オブジェクトの整合性の確認（ETag）](https://docs.aws.amazon.com/ja_jp/AmazonS3/latest/userguide/checking-object-integrity.html)
