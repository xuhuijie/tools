/* 证书与密钥：SSL 证书解析校验 / 自建 CA 签发 / RSA·EC 密钥生成 / JWT 签名验签
   依赖 docs/lib/forge.js（node-forge）。密钥生成与签名都在本地完成，不上传。
   明确不做的：证书链验证（没有中间证书、也不联网取证书）、Bitcoin/Ed25519 密钥。 */
(function () {
  'use strict';
  var $ = T.$;

  function forgeOk() {
    return typeof forge !== 'undefined' && forge && forge.pki;
  }

  function needForge() {
    if (!forgeOk()) throw new Error('加密库未加载（docs/lib/forge.js 需与本页同目录部署）');
  }

  /* ================= 工具 ================= */

  function cell(k, v) {
    var d = document.createElement('div');
    var kk = document.createElement('div'); kk.className = 'k'; kk.textContent = k;
    var vv = document.createElement('div'); vv.className = 'v'; vv.textContent = v;
    d.appendChild(kk); d.appendChild(vv);
    return d;
  }

  function setGrid(el, pairs) {
    el.innerHTML = '';
    pairs.forEach(function (p) { el.appendChild(cell(p[0], p[1])); });
  }

  function setStat(el, pairs) {
    el.innerHTML = '';
    pairs.forEach(function (p) {
      var d = document.createElement('div');
      var b = document.createElement('b'); b.textContent = p[1];
      var s = document.createElement('span'); s.textContent = p[0];
      d.appendChild(b); d.appendChild(s);
      el.appendChild(d);
    });
  }

  function setTable(tbody, rows) {
    tbody.innerHTML = '';
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      r.forEach(function (v) {
        var td = document.createElement('td');
        td.textContent = v == null ? '—' : String(v);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function hexColon(hex) {
    return hex.toUpperCase().replace(/(..)(?=.)/g, '$1:');
  }

  function fmtDate(d) {
    if (!d) return '—';
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
      ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) + ' UTC';
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function copy(text, btn) {
    T.copy(text);
    if (!btn) return;
    var old = btn.textContent;
    btn.textContent = '已复制';
    setTimeout(function () { btn.textContent = old; }, 1200);
  }

  function digestHex(algo, bytes) {
    var md = forge.md[algo].create();
    md.update(bytes);
    return md.digest().toHex();
  }

  /* ================= 1. SSL 证书校验 ================= */

  var KEY_USAGE = ['digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment',
    'keyAgreement', 'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly'];
  var EXT_KEY_USAGE = {
    serverAuth: 'TLS 服务端认证',
    clientAuth: 'TLS 客户端认证',
    codeSigning: '代码签名',
    emailProtection: '邮件保护',
    timeStamping: '时间戳',
    ocspSigning: 'OCSP 签名'
  };

  var BASIC_CONSTRAINT_NOTE = {
    'CA:TRUE': '自己是 CA，可签发其他证书',
    'CA:TRUE, pathlen:0': '是 CA，但只能签发末端证书',
    'CA:FALSE': '末端证书，不能再签证书'
  };

  function certParse(pemOrDer) {
    needForge();
    var cert;
    var text = String(pemOrDer || '').trim();
    if (!text) throw new Error('请输入证书内容');
    if (text.indexOf('-----BEGIN') >= 0) {
      cert = forge.pki.certificateFromPem(text);
    } else {
      // 容忍纯 base64（没带头尾）与十六进制
      // 没带头尾时按 base64 处理（复制粘贴常丢头尾）；纯十六进制才走 DER
      var raw = text.replace(/\s+/g, '');
      var looksHex = /^[0-9a-fA-F]+$/.test(raw) && /[a-fA-F]/.test(raw) && raw.length % 2 === 0;
      try {
        cert = looksHex
          ? forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.hexToBytes(raw)))
          : forge.pki.certificateFromPem('-----BEGIN CERTIFICATE-----\n' + raw + '\n-----END CERTIFICATE-----');
      } catch (e) {
        throw new Error('既不是 PEM，也不是合法的 DER/Base64 证书（' + e.message + '）');
      }
    }
    return cert;
  }

  function certInfo(cert, now) {
    needForge();
    now = now || new Date();
    var asn1 = forge.pki.certificateToAsn1(cert);
    var der = forge.asn1.toDer(asn1).getBytes();
    var notBefore = cert.validity.notBefore;
    var notAfter = cert.validity.notAfter;
    var msLeft = notAfter.getTime() - now.getTime();
    var daysLeft = Math.floor(msLeft / 86400000);
    var notYetValid = now.getTime() < notBefore.getTime();

    var exts = {};
    (cert.extensions || []).forEach(function (e) { exts[e.name] = e; });

    var subjectAlt = [];
    if (exts.subjectAltName && exts.subjectAltName.altNames) {
      exts.subjectAltName.altNames.forEach(function (a) {
        if (a.type === 2) subjectAlt.push('DNS:' + a.value);
        else if (a.type === 7) subjectAlt.push('IP:' + a.ip);
        else if (a.type === 6) subjectAlt.push('URI:' + a.value);
        else if (a.type === 1) subjectAlt.push('邮箱:' + a.value);
        else subjectAlt.push('类型 ' + a.type + ':' + a.value);
      });
    }

    var keyUsage = [];
    if (exts.keyUsage) KEY_USAGE.forEach(function (k) { if (exts.keyUsage[k]) keyUsage.push(k); });

    var extKeyUsage = [];
    if (exts.extKeyUsage) {
      Object.keys(EXT_KEY_USAGE).forEach(function (k) { if (exts.extKeyUsage[k]) extKeyUsage.push(k); });
    }

    var keyInfo = { type: '未知', bits: 0, curve: '' };
    if (cert.publicKey) {
      if (cert.publicKey.n) {
        keyInfo.type = 'RSA';
        keyInfo.bits = cert.publicKey.n.bitLength();
      } else if (cert.publicKey.data) {
        // forge 把 EC 曲线与公钥点放在 data 里，用 OID 反查算法名
        var oid = cert.publicKey.curve || '';
        keyInfo.type = 'EC';
        keyInfo.curve = oid || '未知曲线';
        keyInfo.bits = curveBits(oid);
      }
    }

    var bc = exts.basicConstraints;
    var bcText = bc ? ('CA:' + (bc.cA ? 'TRUE' : 'FALSE') + (bc.pathLenConstraint != null ? ', pathlen:' + bc.pathLenConstraint : '')) : '未声明';

    return {
      subject: cert.subject.getField('CN') ? cert.subject.getField('CN').value : '',
      subjectAll: cert.subject.attributes.map(function (a) { return a.shortName + '=' + a.value; }).join(', '),
      issuer: cert.issuer.getField('CN') ? cert.issuer.getField('CN').value : '',
      issuerAll: cert.issuer.attributes.map(function (a) { return a.shortName + '=' + a.value; }).join(', '),
      selfSigned: cert.subject.hash === cert.issuer.hash,
      serial: cert.serialNumber.replace(/^0+/, '') || '0',
      notBefore: notBefore, notAfter: notAfter,
      daysLeft: daysLeft, notYetValid: notYetValid, expired: msLeft < 0,
      sha1: digestHex('sha1', der),
      sha256: digestHex('sha256', der),
      sha512: digestHex('sha512', der),
      md5: digestHex('md5', der),
      sizeBytes: der.length,
      sigAlg: (function () {
        var oid = cert.siginfo && cert.siginfo.algorithmOid;
        return (forge.pki.oids[oid] || oid || '未知');
      })(),
      keyInfo: keyInfo,
      san: subjectAlt,
      keyUsage: keyUsage,
      extKeyUsage: extKeyUsage,
      basicConstraints: bcText,
      basicConstraintsNote: BASIC_CONSTRAINT_NOTE[bcText] || '',
      subjectKeyId: exts.subjectKeyIdentifier ? exts.subjectKeyIdentifier.subjectKeyIdentifier : '',
      authorityKeyId: exts.authorityKeyIdentifier ? (exts.authorityKeyIdentifier.keyIdentifier || '') : '',
      crl: exts.cRLDistributionPoints && exts.cRLDistributionPoints.altNames
        ? exts.cRLDistributionPoints.altNames.map(function (a) { return a.value; }).join(', ') : '',
      aia: exts.authorityInfoAccess && exts.authorityInfoAccess.accessDescriptions
        ? exts.authorityInfoAccess.accessDescriptions.map(function (d) { return d.accessLocation.value; }).join(', ') : ''
    };
  }

  function curveBits(oid) {
    var m = { '1.2.840.10045.3.1.7': 256, '1.3.132.0.34': 384, '1.3.132.0.35': 521, '1.3.132.0.10': 256 };
    return m[oid] || 0;
  }

  function slRun() {
    var msg = $('sl-msg'), days = $('sl-days'), warn = $('sl-warn');
    msg.className = 'hint';
    msg.textContent = '';
    days.className = 'days';
    days.textContent = '';
    warn.hidden = true;

    var info;
    try {
      var cert = certParse($('sl-in').value);
      info = certInfo(cert);
    } catch (e) {
      msg.className = 'hint err';
      msg.textContent = '解析失败：' + (e.message || e) + '。请检查是否粘贴了完整的 PEM（含 BEGIN/END 行）。';
      $('sl-stat').innerHTML = '';
      $('sl-grid').innerHTML = '';
      $('sl-body').innerHTML = '';
      return null;
    }

    if (info.notYetValid) {
      days.className = 'days bad';
      days.innerHTML = '尚未生效 <small>生效时间 ' + fmtDate(info.notBefore) + '</small>';
    } else if (info.expired) {
      days.className = 'days bad';
      days.innerHTML = '已过期 ' + Math.abs(info.daysLeft) + ' 天 <small>到 ' + fmtDate(info.notAfter) + '</small>';
    } else {
      days.className = 'days' + (info.daysLeft < 30 ? ' bad' : ' ok');
      days.innerHTML = '剩余 ' + info.daysLeft + ' 天 <small>到 ' + fmtDate(info.notAfter) + '</small>';
    }

    var warnings = [];
    if (info.expired) warnings.push('证书已过期。');
    if (info.notYetValid) warnings.push('证书还没到生效时间。');
    if (!info.expired && info.daysLeft < 30) warnings.push('距到期不足 30 天，该续期了。');
    if (info.keyInfo.type === 'RSA' && info.keyInfo.bits && info.keyInfo.bits < 2048) {
      warnings.push('RSA 密钥只有 ' + info.keyInfo.bits + ' 位，主流浏览器与 CA 已不接受 1024 位。');
    }
    if (info.sigAlg.indexOf('sha1') >= 0 || info.sigAlg.indexOf('md5') >= 0) {
      warnings.push('签名算法 ' + info.sigAlg + ' 已被废弃，Chrome 等浏览器会直接报不安全。');
    }
    if (!info.san.length) {
      warnings.push('没有 subjectAltName（SAN）。2017 年后浏览器只看 SAN，不再回退到 CommonName，这样的证书对域名无效。');
    }
    if (info.keyUsage.length && info.keyUsage.indexOf('digitalSignature') < 0 && info.extKeyUsage.indexOf('serverAuth') >= 0) {
      warnings.push('扩展密钥用法声明了 serverAuth，但 KeyUsage 里没有 digitalSignature，配置可能不一致。');
    }
    if (warnings.length) {
      warn.hidden = false;
      warn.innerHTML = '<b>发现 ' + warnings.length + ' 处需要注意：</b><br>· ' + warnings.join('<br>· ');
    }

    /* 先判断一下链的问题：本页可随手头有无自签根来判断，但不做链式校验 */
    var chainNote = '本页只解析这一张证书，未做链式校验';
    if (info.selfSigned) chainNote = '自签证书（subject = issuer），浏览器默认不信任';

    setStat($('sl-stat'), [
      ['密钥算法', info.keyInfo.type + (info.keyInfo.bits ? ' ' + info.keyInfo.bits : '')],
      ['签名算法', info.sigAlg],
      ['证书类型', info.basicConstraints.indexOf('CA:TRUE') === 0 ? 'CA 证书' : '末端证书']
    ]);

    setGrid($('sl-grid'), [
      ['CommonName', info.subject || '—'],
      ['颁发者 CN', info.issuer || '—'],
      ['序列号', info.serial],
      ['主体', info.issuerAll],
      ['自签', info.selfSigned ? '是' : '否'],
      ['链信息', chainNote]
    ]);

    setTable($('sl-body'), [
      ['主题（Subject）', info.subjectAll],
      ['颁发者（Issuer）', info.issuerAll],
      ['生效时间', fmtDate(info.notBefore)],
      ['失效时间', fmtDate(info.notAfter)],
      ['SAN（主体备用名）', info.san.length ? info.san.join('、') : '（无，现代浏览器会判无效）'],
      ['Basic Constraints', info.basicConstraints + (info.basicConstraintsNote ? '（' + info.basicConstraintsNote + '）' : '')],
      ['Key Usage', info.keyUsage.length ? info.keyUsage.join('、') : '未声明'],
      ['Extended Key Usage', info.extKeyUsage.length
        ? info.extKeyUsage.map(function (k) { return k + '（' + EXT_KEY_USAGE[k] + '）'; }).join('、') : '未声明'],
      ['Subject Key Identifier', info.subjectKeyId || '未声明'],
      ['Authority Key Identifier', info.authorityKeyId || '未声明（无中间证书时无法完成链验证）'],
      ['CRL 分发点', info.crl || '未声明'],
      ['OCSP / CA Issuers', info.aia || '未声明'],
      ['DER 大小', info.sizeBytes + ' 字节'],
      ['MD5 指纹', hexColon(info.md5)],
      ['SHA-1 指纹', hexColon(info.sha1)],
      ['SHA-256 指纹', hexColon(info.sha256)],
      ['SHA-512 指纹', hexColon(info.sha512)]
    ]);

    msg.className = 'hint';
    msg.textContent = info.selfSigned ? '解析完成。这是一张自签证书，浏览器默认不信任。' : '解析完成。';
    return info;
  }

  $('sl-run').addEventListener('click', slRun);
  $('sl-clear').addEventListener('click', function () {
    $('sl-in').value = '';
    $('sl-msg').className = 'hint';
    $('sl-msg').textContent = '';
    $('sl-days').textContent = '';
    $('sl-stat').innerHTML = '';
    $('sl-grid').innerHTML = '';
    $('sl-body').innerHTML = '';
    $('sl-warn').hidden = true;
  });

  // 示例证书随仓库携带（docs/cert-sample.pem），直接 fetch 同目录文件，离线也能用
  $('sl-sample').addEventListener('click', function () {
    var btn = this;
    fetch('./cert-sample.pem').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (t) {
      $('sl-in').value = t;
      slRun();
    }).catch(function (e) {
      $('sl-msg').className = 'hint err';
      $('sl-msg').textContent = '示例证书读取失败：' + e.message +
        '（file:// 下部分浏览器不允许读取本地文件；可直接把 openssl 生成的证书粘贴进来）';
    }).then(function () { btn.textContent = '载入示例证书'; });
  });

  $('sl-file').addEventListener('click', function () { $('sl-filein').click(); });
  $('sl-filein').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      $('sl-in').value = String(rd.result);
      slRun();
    };
    rd.readAsText(f);
  });

  /* ================= 2. 自建 CA ================= */

  function caCertify(caKey, caCert, cnList, days, serial) {
    needForge();
    var keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
    var cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = String(serial);
    cert.validity.notBefore = new Date(Date.now() - 60000);
    cert.validity.notAfter = new Date(Date.now() + days * 86400000);
    cert.setSubject([{ name: 'commonName', value: cnList[0] }]);
    cert.setIssuer(caCert.subject.attributes);
    var alts = cnList.map(function (n) {
      return /^\d+\.\d+\.\d+\.\d+$/.test(n) ? { type: 7, ip: n } : { type: 2, value: n };
    });
    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
      { name: 'subjectAltName', altNames: alts },
      { name: 'subjectKeyIdentifier' }
    ]);
    cert.sign(caKey, forge.md.sha256.create());
    return { keys: keys, cert: cert };
  }

  function caVerify(caCert, leafCert) {
    needForge();
    return caCert.verify(leafCert);
  }

  function caBuild(opts) {
    needForge();
    var caKeys = forge.pki.rsa.generateKeyPair({ bits: opts.caBits, e: 0x10001 });
    var caCert = forge.pki.createCertificate();
    caCert.publicKey = caKeys.publicKey;
    caCert.serialNumber = '01';
    caCert.validity.notBefore = new Date(Date.now() - 60000);
    caCert.validity.notAfter = new Date(Date.now() + opts.caDays * 86400000);
    var dn = [{ name: 'commonName', value: opts.caName }];
    caCert.setSubject(dn);
    caCert.setIssuer(dn);
    caCert.setExtensions([
      { name: 'basicConstraints', cA: true, pathLenConstraint: 0 },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, digitalSignature: true },
      { name: 'subjectKeyIdentifier' }
    ]);
    caCert.sign(caKeys.privateKey, forge.md.sha256.create());

    var leaf = caCertify(caKeys.privateKey, caCert, opts.cnList, opts.leafDays, opts.serial);
    // 自检：leaf 必须能被 CA 验证通过；不通过就说明签错了，直接报出来而不是把文件给你
    if (!caCert.verify(leaf.cert)) {
      throw new Error('自检失败：签发的证书无法用 CA 验证通过，请重试');
    }

    return {
      caKeyPem: forge.pki.privateKeyToPem(caKeys.privateKey),
      caCertPem: forge.pki.certificateToPem(caCert),
      leafKeyPem: forge.pki.privateKeyToPem(leaf.keys.privateKey),
      leafCertPem: forge.pki.certificateToPem(leaf.cert),
      caCert: caCert,
      leafCert: leaf.cert,
      cnList: opts.cnList,
      leafDays: opts.leafDays,
      caDays: opts.caDays,
      caBits: opts.caBits
    };
  }

  function caSteps(r) {
    return [
      '# 本页生成的是一套「自建 CA + 站点证书」，只适合本地与内网。',
      '',
      '## 1. 把 CA 证书装进系统/浏览器信任库（只在这台机器上开发时）',
      '   macOS:  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ca.crt',
      '   Windows: 双击 ca.crt → 安装证书 → 本地计算机 → 受信任的根证书颁发机构',
      '   Linux:  sudo cp ca.crt /usr/local/share/ca-certificates/myca.crt && sudo update-ca-certificates',
      '',
      '## 2. 放到服务端（nginx 为例）',
      '   ssl_certificate     /etc/ssl/' + (r.cnList[0] || 'localhost').replace('*', 'wildcard') + '.crt;',
      '   ssl_certificate_key /etc/ssl/' + (r.cnList[0] || 'localhost').replace('*', 'wildcard') + '.key;',
      '',
      '## 3. 用 curl 验证（-k 是跳过信任校验，这里故意不加）',
      '   curl -v --cacert ca.crt https://' + (r.cnList[0] || 'localhost') + '/',
      '',
      '## 4. 检查证书内容',
      '   openssl x509 -in site.crt -noout -text | head -40',
      '   openssl verify -CAfile ca.crt site.crt',
      '',
      '## 别忘了',
      '   - 站点证书文件名里的 * 不能直接当通配符用，改写成 wildcard 之类',
      '   - 这套密钥是浏览器生成的，别拿去对外提供服务或长期使用',
      '   - 证书默认 SAN 为：' + (r.cnList.join('、') || '（无）'),
      '   - 有效期：站点 ' + r.leafDays + ' 天，CA ' + r.caDays + ' 天'
    ].join('\n');
  }

  var caResult = null, caPart = 'cakey';

  function caOut() {
    var box = $('ca-out');
    if (!caResult) { box.textContent = ''; return ''; }
    var map = {
      cakey: { title: 'CA 私钥（ca.key）', text: caResult.caKeyPem, file: 'ca.key' },
      cacert: { title: 'CA 证书（ca.crt）', text: caResult.caCertPem, file: 'ca.crt' },
      key: { title: '站点私钥（site.key）', text: caResult.leafKeyPem, file: 'site.key' },
      cert: { title: '站点证书（site.crt）', text: caResult.leafCertPem, file: 'site.crt' },
      chain: { title: '完整链（site-chain.crt，站点证书在前）', text: caResult.leafCertPem + caResult.caCertPem, file: 'site-chain.crt' },
      steps: { title: '使用步骤', text: caSteps(caResult), file: 'README.txt' }
    };
    var p = map[caPart];
    box.textContent = '# ' + p.title + '\n\n' + p.text;
    return p;
  }

  function caSwitch(part) {
    caPart = part;
    caOut();
  }

  $('ca-run').addEventListener('click', function () {
    var msg = $('ca-msg');
    var cnList = String($('ca-cn').value).split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!cnList.length) {
      msg.className = 'hint err';
      msg.textContent = '至少填一个域名或主机名。';
      return null;
    }
    msg.className = 'hint';
    msg.textContent = '正在生成密钥（RSA ' + $('ca-keytype').value + '，可能要几秒）…';
    var btn = this;
    btn.disabled = true;
    setTimeout(function () {
      try {
        caResult = caBuild({
          caName: $('ca-name').value || 'Local Dev CA',
          caDays: Math.max(1, Math.min(3650, Number($('ca-days').value) || 3650)),
          caBits: Number($('ca-keytype').value) || 2048,
          cnList: cnList,
          leafDays: Math.max(1, Math.min(825, Number($('ca-leaf-days').value) || 825)),
          serial: Math.max(1, Number($('ca-serial').value) || 4096)
        });
        caOut();
        setGrid($('ca-grid'), [
          ['CA 通用名', $('ca-name').value],
          ['CA 有效期', caResult.caDays + ' 天'],
          ['CA 密钥', 'RSA ' + caResult.caBits],
          ['站点 SAN', caResult.cnList.join('、')],
          ['站点有效期', caResult.leafDays + ' 天'],
          ['自检验签', caResult.caCert.verify(caResult.leafCert) ? '通过 ✓' : '未通过 ✗']
        ]);
        msg.className = 'hint';
        msg.textContent = '生成完成。站点证书用 CA 验签已通过。私钥请当测试数据看待。';
      } catch (e) {
        msg.className = 'hint err';
        msg.textContent = '生成失败：' + (e.message || e);
      }
      btn.disabled = false;
    }, 20);
  });

  $('ca-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    [].forEach.call(this.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
    caSwitch(b.dataset.part);
  });
  $('ca-copy').addEventListener('click', function () {
    var p = caOut();
    if (p) copy(p.text, this);
  });
  $('ca-down').addEventListener('click', function () {
    var p = caOut();
    if (p) download(p.file, p.text);
  });
  $('ca-all').addEventListener('click', function () {
    if (!caResult) { $('ca-msg').className = 'hint err'; $('ca-msg').textContent = '先生成。'; return; }
    [['ca.key', caResult.caKeyPem], ['ca.crt', caResult.caCertPem], ['site.key', caResult.leafKeyPem],
     ['site.crt', caResult.leafCertPem], ['site-chain.crt', caResult.leafCertPem + caResult.caCertPem],
     ['README.txt', caSteps(caResult)]].forEach(function (f, i) {
      setTimeout(function () { download(f[0], f[1]); }, i * 350);
    });
  });
  $('ca-clear').addEventListener('click', function () {
    caResult = null;
    $('ca-out').textContent = '';
    $('ca-grid').innerHTML = '';
    $('ca-msg').className = 'hint';
    $('ca-msg').textContent = '';
  });

  /* ================= 3. RSA / EC 密钥 ================= */

  var rkResult = null, rkPart = 'priv';

  function rsaKeypair(bits) {
    needForge();
    return forge.pki.rsa.generateKeyPair({ bits: bits, e: 0x10001 });
  }

  function ecKeypair(curve) {
    needForge();
    // forge 的 EC 生成是同步的，P-521 会明显卡一下
    return forge.pki.ec.generateKeyPair(curve);
  }

  function sshPub(publicKey) {
    needForge();
    if (typeof forge.ssh !== 'undefined' && forge.ssh.publicKeyToOpenSSH) {
      return forge.ssh.publicKeyToOpenSSH(publicKey);
    }
    throw new Error('当前 forge 构建未包含 SSH 模块，请用下面的 SPKI 公钥');
  }

  function csrMake(keypair, cn) {
    needForge();
    var csr = forge.pki.createCertificationRequest();
    csr.publicKey = keypair.publicKey;
    csr.setSubject([{ name: 'commonName', value: cn || 'example.com' }]);
    csr.setAttributes([{ name: 'extensionRequest', extensions: [
      { name: 'subjectAltName', altNames: [{ type: 2, value: cn || 'example.com' }] }
    ]}]);
    csr.sign(keypair.privateKey, forge.md.sha256.create());
    return csr;
  }

  function rkOut() {
    var box = $('rk-out');
    if (!rkResult) { box.textContent = ''; return ''; }
    var map = {
      priv: { title: '私钥（PKCS#8，未加密）', text: rkResult.priv, file: 'private-key.pem' },
      pub: { title: '公钥（SPKI）', text: rkResult.pub, file: 'public-key.pem' },
      pubssh: { title: 'OpenSSH 公钥', text: rkResult.ssh, file: 'public-key.pub' },
      p10: { title: '证书签名请求（CSR, PKCS#10）', text: rkResult.csr, file: 'request.csr' }
    };
    var p = map[rkPart];
    box.textContent = '# ' + p.title + '\n\n' + p.text;
    return p;
  }

  $('rk-kind').addEventListener('change', function () {
    var isRsa = this.value === 'rsa';
    $('rk-rsa-row').hidden = !isRsa;
    $('rk-ec-row').hidden = isRsa;
  });

  $('rk-run').addEventListener('click', function () {
    var msg = $('rk-msg');
    var kind = $('rk-kind').value;
    var btn = this;
    btn.disabled = true;
    msg.className = 'hint';
    msg.textContent = '正在生成密钥对…';
    setTimeout(function () {
      try {
        var t0 = Date.now();
        var kp;
        if (kind === 'rsa') {
          kp = rsaKeypair(Number($('rk-bits').value) || 2048);
        } else {
          kp = ecKeypair($('rk-curve').value);
        }
        var csr = csrMake(kp, 'example.com');
        if (!csr.verify()) throw new Error('自检失败：CSR 验签未通过');
        var priv = forge.pki.privateKeyToPem(kp.privateKey);
        var pub = forge.pki.publicKeyToPem(kp.publicKey);
        var ssh;
        try { ssh = sshPub(kp.publicKey); } catch (e2) { ssh = '（本构建不支持 SSH 输出：' + e2.message + '）'; }
        rkResult = { priv: priv, pub: pub, ssh: ssh, csr: forge.pki.certificationRequestToPem(csr), kind: kind, ms: Date.now() - t0 };
        rkOut();
        var bits = kind === 'rsa' ? (Number($('rk-bits').value) || 2048) : curveBitsByName($('rk-curve').value);
        setStat($('rk-stat'), [
          ['算法', kind === 'rsa' ? 'RSA' : 'ECDSA ' + $('rk-curve').value],
          ['密钥长度', String(bits) + ' 位'],
          ['耗时', rkResult.ms + ' ms']
        ]);
        msg.className = 'hint';
        msg.textContent = '生成完成，CSR 自检验签通过。';
      } catch (e) {
        msg.className = 'hint err';
        msg.textContent = '生成失败：' + (e.message || e);
      }
      btn.disabled = false;
    }, 30);
  });

  function curveBitsByName(name) {
    return { 'P-256': 256, 'P-384': 384, 'P-521': 521 }[name] || 0;
  }

  $('rk-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    [].forEach.call(this.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
    rkPart = b.dataset.part;
    rkOut();
  });
  $('rk-copy').addEventListener('click', function () { var p = rkOut(); if (p) copy(p.text, this); });
  $('rk-down').addEventListener('click', function () { var p = rkOut(); if (p) download(p.file, p.text); });
  $('rk-pubdown').addEventListener('click', function () {
    if (rkResult) download('public-key.pem', rkResult.pub);
  });
  $('rk-clear').addEventListener('click', function () {
    rkResult = null;
    $('rk-out').textContent = '';
    $('rk-stat').innerHTML = '';
    $('rk-msg').className = 'hint';
    $('rk-msg').textContent = '';
  });

  /* ================= 4. JWT ================= */

  var ALG_INFO = {
    HS256: { kind: 'hmac', hash: 'sha256' }, HS384: { kind: 'hmac', hash: 'sha384' }, HS512: { kind: 'hmac', hash: 'sha512' },
    RS256: { kind: 'rsa', hash: 'sha256' }, RS384: { kind: 'rsa', hash: 'sha384' }, RS512: { kind: 'rsa', hash: 'sha512' },
    PS256: { kind: 'pss', hash: 'sha256' },
    ES256: { kind: 'ec', hash: 'sha256' }, ES384: { kind: 'ec', hash: 'sha384' },
    none: { kind: 'none' }
  };

  // base64url → UTF-8 字符串。JS 的 atob 只吐 Latin-1，
  // 中文 payload 必须先还原成字节序列再按 UTF-8 解码，否则中文声明会解析失败。
  function b64urlDecode(s) {
    var bytes = b64urlBytes(s);
    var str = '';
    for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    try {
      return decodeURIComponent(escape(str));
    } catch (e) {
      return str;
    }
  }

  function b64urlBytes(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function parsePemKey(text) {
    needForge();
    var t = String(text || '').trim();
    if (t.indexOf('PRIVATE KEY') >= 0) return { type: 'private', key: forge.pki.privateKeyFromPem(t) };
    if (t.indexOf('PUBLIC KEY') >= 0) return { type: 'public', key: forge.pki.publicKeyFromPem(t) };
    if (t.indexOf('CERTIFICATE') >= 0) {
      var c = forge.pki.certificateFromPem(t);
      return { type: 'public', key: c.publicKey, cert: c };
    }
    throw new Error('无法识别的密钥格式，请粘贴 PEM 私钥、公钥或证书');
  }

  function jwtVerify(token, alg, keyText) {
    needForge();
    var parts = String(token || '').trim().split('.');
    if (parts.length !== 3) return { err: 'JWT 必须是三段（header.payload.signature），实际 ' + parts.length + ' 段' };

    var header, payload;
    try {
      header = JSON.parse(b64urlDecode(parts[0]));
    } catch (e) { return { err: 'header 不是合法 JSON：' + e.message }; }
    try {
      payload = JSON.parse(b64urlDecode(parts[1]));
    } catch (e) { return { err: 'payload 不是合法 JSON：' + e.message }; }

    var info = ALG_INFO[alg];
    if (!info) return { err: '不支持的算法 ' + alg, header: header, payload: payload };

    // alg 混淆防护：声明里写 none 或换了算法，都与手选算法比对
    var declared = String(header.alg || '');
    var algMatch = declared === alg;
    if (!algMatch) {
      return {
        header: header, payload: payload, algMatch: false, verified: false,
        err: '声明算法是 ' + (declared || '（缺失）') + '，与你选择校验的 ' + alg + ' 不一致。' +
          '这正是 alg 混淆攻击的形态，已拒绝验签。'
      };
    }

    var signingInput = parts[0] + '.' + parts[1];
    var sigBytes = b64urlBytes(parts[2]);
    var md = forge.md[info.hash].create();
    md.update(signingInput, 'utf8');
    var digest = md.digest().getBytes();

    var verified = false, detail = '';
    try {
      if (info.kind === 'none') {
        verified = parts[2] === '';
        detail = verified ? '声明 alg=none 且签名为空。这类 token 任何人都能伪造，不要信任。'
          : '声明 alg=none，但签名段不为空。';
      } else if (info.kind === 'hmac') {
        var hmac = forge.hmac.create();
        hmac.start(info.hash, keyText);
        hmac.update(signingInput);
        var expect = hmac.digest().getBytes();
        verified = constantEquals(expect, bytesToBinary(sigBytes));
        detail = 'HMAC-' + info.hash.toUpperCase() + '，' + (verified ? '签名一致' : '签名不一致');
      } else {
        var pk = parsePemKey(keyText);
        var pub = pk.type === 'public' ? pk.key : forge.pki.setRsaPublicKey(pk.key.n, pk.key.e);
        if (info.kind === 'rsa') {
          verified = pub.verify(digest, bytesToBinary(sigBytes));
        } else if (info.kind === 'pss') {
          verified = pub.verify(digest, bytesToBinary(sigBytes), 'RSASSA-PSS');
        } else {
          verified = pub.verify(digest, bytesToBinary(sigBytes));
        }
        detail = info.kind.toUpperCase() + ' 验签' + (verified ? '通过' : '失败');
      }
    } catch (e) {
      return { err: '验签过程出错：' + (e.message || e), header: header, payload: payload, algMatch: true, verified: false };
    }

    var now = Math.floor(Date.now() / 1000);
    return {
      header: header, payload: payload, algMatch: true, verified: verified,
      detail: detail, signature: parts[2],
      exp: payload.exp, nbf: payload.nbf, iat: payload.iat,
      expired: payload.exp != null && now >= Number(payload.exp),
      notYet: payload.nbf != null && now < Number(payload.nbf),
      now: now,
      claims: Object.keys(payload)
    };
  }

  // 逐字节比较，避免早退泄露签名信息
  function constantEquals(a, b) {
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function bytesToBinary(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  var CLAIM_DESC = {
    iss: '签发者', sub: '主体', aud: '受众', exp: '过期时间', nbf: '生效时间', iat: '签发时间', jti: '唯一编号'
  };

  // base64url 编码：先按 UTF-8 转字节再编码，不然中文声明会编出带 \x00 的坏串
  function b64urlEncode(str) {
    var utf8 = unescape(encodeURIComponent(str));
    var b64 = btoa(utf8);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // 生成一个 HS256 示例 token，省得用户手边没现成的
  function sampleJwt(secret) {
    secret = secret || 'your-256-bit-secret';
    var header = { alg: 'HS256', typ: 'JWT' };
    var now = Math.floor(Date.now() / 1000);
    var payload = { sub: '1234567890', name: '徐惠杰', iss: 'cnb.cool', iat: now, exp: now + 3600 };
    var h = b64urlEncode(JSON.stringify(header));
    var p = b64urlEncode(JSON.stringify(payload));
    var hmac = forge.hmac.create();
    hmac.start('sha256', secret);
    hmac.update(h + '.' + p);
    var sig = hmac.digest();
    // digest().getBytes() 是 binary 串，转字节再 base64url
    var bytes = sig.getBytes();
    var b = '';
    for (var i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes.charCodeAt(i));
    return h + '.' + p + '.' + btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function jtRun() {
    var msg = $('jt-msg');
    var r = jwtVerify($('jt-in').value, $('jt-alg').value, $('jt-key').value);
    $('jt-stat').innerHTML = '';
    $('jt-grid').innerHTML = '';
    $('jt-body').innerHTML = '';
    $('jt-out').textContent = '';
    if (r.err) {
      msg.className = 'hint err';
      msg.textContent = '校验不通过：' + r.err;
      if (r.header) $('jt-out').textContent = 'header = ' + JSON.stringify(r.header, null, 2) + '\n\npayload = ' + JSON.stringify(r.payload, null, 2);
      return r;
    }
    msg.className = r.verified ? 'hint' : 'hint err';
    msg.textContent = (r.verified ? '签名有效。' : '签名无效：token 可能被改过，或密钥/公钥不对。') + r.detail + '。';

    setStat($('jt-stat'), [
      ['签名', r.verified ? '有效' : '无效'],
      ['算法', r.header.alg],
      ['时间状态', r.expired ? '已过期' : r.notYet ? '尚未生效' : '在有效期内']
    ]);

    setGrid($('jt-grid'), [
      ['typ', r.header.typ || '（未声明）'],
      ['kid', r.header.kid || '（未声明）'],
      ['exp', r.exp != null ? fmtTs(r.exp) : '（未声明）'],
      ['iat', r.iat != null ? fmtTs(r.iat) : '（未声明）'],
      ['nbf', r.nbf != null ? fmtTs(r.nbf) : '（未声明）'],
      ['剩余有效期', r.exp != null ? (r.expired ? '已过期 ' + fmtDur(r.now - r.exp) : fmtDur(r.exp - r.now)) : '—']
    ]);

    setTable($('jt-body'), Object.keys(r.payload).map(function (k) {
      var v = r.payload[k];
      return [k, typeof v === 'object' ? JSON.stringify(v) : String(v), CLAIM_DESC[k] || ''];
    }));

    $('jt-out').textContent =
      'header = ' + JSON.stringify(r.header) + '\n' +
      'payload = ' + JSON.stringify(r.payload) + '\n' +
      'signature(b64url) = ' + r.signature;
    return r;
  }

  function fmtTs(sec) {
    return new Date(Number(sec) * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
  }

  function fmtDur(sec) {
    sec = Math.abs(Math.round(sec));
    var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    if (d) return d + ' 天 ' + h + ' 小时';
    if (h) return h + ' 小时 ' + m + ' 分';
    return m + ' 分 ' + (sec % 60) + ' 秒';
  }

  $('jt-run').addEventListener('click', jtRun);
  $('jt-sample').addEventListener('click', function () {
    if (!forgeOk()) { $('jt-msg').className = 'hint err'; $('jt-msg').textContent = '加密库未加载。'; return; }
    $('jt-in').value = sampleJwt();
    $('jt-key').value = 'your-256-bit-secret';
    $('jt-alg').value = 'HS256';
    jtRun();
  });
  $('jt-clear').addEventListener('click', function () {
    $('jt-in').value = '';
    $('jt-key').value = '';
    $('jt-msg').className = 'hint';
    $('jt-msg').textContent = '';
    ['jt-stat', 'jt-grid', 'jt-body'].forEach(function (id) { $(id).innerHTML = ''; });
    $('jt-out').textContent = '';
  });
  ['jt-in', 'jt-alg', 'jt-key'].forEach(function (id) {
    $(id).addEventListener('change', function () { if ($('jt-in').value.trim()) jtRun(); });
  });

  /* ================= 页签与初始化 ================= */

  var PANELS = ['ssl', 'ca', 'rsa', 'jwt'];
  function setTab(name) {
    T.markTab(name);
    PANELS.forEach(function (p) { $('panel-' + p).hidden = p !== name; });
  }
  T.tabs($('tabs'), setTab);

  $('jt-in').value = forgeOk() ? sampleJwt() : '';
  setTab(T.firstTab('ssl'));
  if (forgeOk()) { jtRun(); }

  window.__crypto2 = {
    certParse: certParse, certInfo: certInfo, caBuild: caBuild, caVerify: caVerify, caSteps: caSteps,
    rsaKeypair: rsaKeypair, ecKeypair: ecKeypair, csrMake: csrMake, sshPub: sshPub,
    jwtVerify: jwtVerify, sampleJwt: sampleJwt, b64urlDecode: b64urlDecode, b64urlEncode: b64urlEncode, b64urlBytes: b64urlBytes,
    constantEquals: constantEquals, ALG_INFO: ALG_INFO, hexColon: hexColon, curveBits: curveBits
  };
})();
