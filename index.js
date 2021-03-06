#!/usr/bin/env node
var fuse = require('fuse-bindings');
var Dat = require('dat-node');
var program = require('commander');

program
  .version(require('./package.json').version);

program
  .command('mount <dir> <key>')
  .description('Mount the dat specified by <key> on <dir>.')
  .option('-v, --version <number>', 'Checkout version [number] of this dat')
  .action(function(dir, key, cmd){
    var datLocation = "dat_dir/" + key;
    mountDat(key, dir, datLocation, cmd.version);
  });

program.parse(process.argv);

if (program.args.length === 0){
  program.help();
}

function mountDat(datKey, mountPath, datLocation, version) {
  // Initialize dat, join the network, and if successful mount with FUSE
  Dat(datLocation, {
    key: datKey,
    sparse: true,
  }, function(err, dat) {
    if (err) {
      console.log("Error! " + err);
      return;
    }
    dat.joinNetwork();

    // Debug notices
    dat.network.on('connected', function() {
      console.log("Connected to a peer");
    });

    dat.network.on('listening', function() {
      if (version) {
        dat.archive = dat.archive.checkout(parseInt(version));
      }
      doMount(dat, mountPath);
    });
  });
}

function doMount(dat, mountPath) {

  // FUSE functions, mostly wrappers around hyperdrive calls
  function readdir(path, cb) {
    console.log('readdir(%s)', path);
    results = dat.archive.readdir(path, cb);
  }

  function getattr(path, cb) {
    console.log('getattr(%s)', path);
    return dat.archive.stat(path, cb);
  }

  function open(path, flags, cb) {
    console.log('open(%s, %d)', path, flags);
    return dat.archive.open(path, flags, cb);
  }

  function read(path, fd, buf, len, pos, cb) {
    console.log('read(%s, %s, %d, %d)', path, fd, len, pos);
    return dat.archive.read(fd, buf, 0, len, pos, function(err, bytes, buffer) {
      if (err) {
        console.log("Error reading:", err);
        cb(0);
      } else {
        cb(bytes, buffer);
      }
    });
  }

  function release(path, fd, cb) {
    console.log("releasing", path, fd, cb);
    return dat.archive.close(fd, cb);
  }

  // Mount the directory
  fuse.mount(mountPath, {
    readdir: readdir,
    getattr: getattr,
    open: open,
    read: read,
    release: release,

    force: true,
  }, function(err) {
    if (err) {
      throw err;
    }
    console.log('filesystem mounted on ' + mountPath);
  });

  // Cleanup when we get ctrl-C
  process.on('SIGINT', function() {
    fuse.unmount(mountPath, function(err) {
      if (err) {
        console.log('filesystem at ' + mountPath + ' not unmounted', err);
      } else {
        console.log('filesystem at ' + mountPath + ' unmounted');
      }
    });
    console.log("Leaving network...");
    dat.close();
  });
}
