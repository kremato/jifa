package org.eclipse.jifa.hda.impl;

import org.graalvm.polyglot.io.FileSystem;
import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.channels.ClosedChannelException;
import java.nio.channels.SeekableByteChannel;
import java.nio.file.*;
import java.nio.file.attribute.FileAttribute;
import java.util.*;

public class InMemoryFileSystem implements FileSystem {
    private final Map<String, byte[]> files = new HashMap<>();
    private final Path virtualRoot = Paths.get("/");

    public InMemoryFileSystem(Map<String, String> sourceMap) {
        // Store file contents as bytes
        for (Map.Entry<String, String> entry : sourceMap.entrySet()) {
            String pathKey = normalizePath(entry.getKey());
            files.put(pathKey, entry.getValue().getBytes());
        }
    }

    private String normalizePath(String path) {
        // Remove leading slashes and normalize separators
        path = path.replace('\\', '/');
        if (path.startsWith("/")) {
            path = path.substring(1);
        }
        return path;
    }

    @Override
    public Path parsePath(URI uri) {
        if (uri == null) {
            throw new IllegalArgumentException("Null URI passed to parsePath");
        }

        if ("file".equals(uri.getScheme()) || uri.getScheme() == null) {
            return parsePath(uri.getPath());
        }

        throw new IllegalArgumentException("Unsupported URI scheme: " + uri);
    }

    @Override
    public Path parsePath(String path) {
        if (path == null) {
            throw new IllegalArgumentException("Null path");
        }
        return virtualRoot.resolve(path).normalize();
    }

    @Override
    public void checkAccess(Path path, Set<? extends AccessMode> modes, LinkOption... linkOptions) throws IOException {
        String key = normalizePath(virtualRoot.relativize(path).toString());
        if (!files.containsKey(key)) {
            throw new NoSuchFileException(path.toString());
        }
        // Only READ access is supported
        for (AccessMode mode : modes) {
            if (mode != AccessMode.READ) {
                throw new AccessDeniedException("Read-only file system: " + path);
            }
        }
    }

    @Override
    public void createDirectory(Path dir, FileAttribute<?>... attrs) throws IOException {
    }

    @Override
    public void delete(Path path) throws IOException {
    }

    @Override
    public SeekableByteChannel newByteChannel(Path path, Set<? extends OpenOption> options, FileAttribute<?>... attrs)
            throws IOException {
        String virtualPath = normalizePath(virtualRoot.relativize(path).toString());
        byte[] content = files.get(virtualPath);
        if (content == null) {
            throw new NoSuchFileException("File not found: " + virtualPath);
        }
        // Only allow read access
        boolean writeRequested = options.stream().anyMatch(opt ->
                opt == StandardOpenOption.WRITE || opt == StandardOpenOption.APPEND || opt == StandardOpenOption.CREATE || opt == StandardOpenOption.CREATE_NEW);
        if (writeRequested) {
            throw new UnsupportedOperationException("File system is read-only");
        }
        // Return a SeekableByteChannel that reads from the byte array
        return new SeekableByteChannel() {
            private int pos = 0;
            private boolean open = true;
            @Override public boolean isOpen() { return open; }
            @Override public long position() { return pos; }
            @Override public SeekableByteChannel position(long newPos) throws IOException {
                if (newPos < 0 || newPos > content.length) {
                    throw new IOException("Position out of bounds");
                }
                pos = (int) newPos;
                return this;
            }
            @Override public int read(ByteBuffer dst) throws IOException {
                if (!open) throw new ClosedChannelException();
                if (pos >= content.length) {
                    return -1;  // EOF
                }
                int bytesToRead = Math.min(dst.remaining(), content.length - pos);
                dst.put(content, pos, bytesToRead);
                pos += bytesToRead;
                return bytesToRead;
            }
            @Override public SeekableByteChannel truncate(long size) throws IOException {
                throw new UnsupportedOperationException("Read-only channel");
            }
            @Override public long size() throws IOException {
                return content.length;
            }
            @Override public int write(ByteBuffer src) throws IOException {
                throw new UnsupportedOperationException("Read-only channel");
            }
            @Override public void close() throws IOException {
                open = false;
            }
        };
    }

    @Override
    public DirectoryStream<Path> newDirectoryStream(Path dir, DirectoryStream.Filter<? super Path> filter) throws IOException {
        return null;
    }

    @Override
    public Path toAbsolutePath(Path path) {
        return path;
    }

    @Override
    public Path toRealPath(Path path, LinkOption... linkOptions) throws IOException {
        return path;
    }

    @Override
    public Map<String, Object> readAttributes(Path path, String attributes, LinkOption... options) throws IOException {
        return Map.of();
    }
}
